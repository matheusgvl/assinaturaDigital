import { HttpStatus, Injectable } from '@nestjs/common';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../../common/http/errors/api.exception';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import {
  PDF_HEADER_LIMIT,
  PDF_IMAGE,
  PDF_JOB_TIMEOUT_MS,
  PDF_LIMIT,
  PDF_OUTPUT_LIMIT,
  P12_LIMIT,
  type PdfJob,
} from './pdf-worker-protocol';

const MAX_RUNNING = 4;
const QUEUE_DEADLINE_MS = 25000;
const MAX_QUEUED = 40;
const MAX_IN_FLIGHT_BYTES = 80 * 1024 * 1024;

/** Perfil aplicado pelo Docker Linux a cada processo efêmero. */
export const PDF_ISOLATION_ARGS = [
  '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
  '--pids-limit=32', '--memory=384m', '--memory-swap=384m', '--cpus=1',
  '--user=10001:10001', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8m',
  '--pull=never', '--log-driver=none',
] as const;

function sandboxUnavailable(): ApiException {
  return new ApiException(API_ERROR_CODES.DOCUMENT, HttpStatus.SERVICE_UNAVAILABLE, 'PDF processing unavailable');
}

function documentRejected(): ApiException {
  return new ApiException(API_ERROR_CODES.DOCUMENT, HttpStatus.UNPROCESSABLE_ENTITY, 'The uploaded file is not an accepted PDF');
}

/** Executa operações de PDF fora do processo HTTP e limita a fila em memória. */
@Injectable()
export class PdfSandboxService {
  private running = 0;
  private inFlightBytes = 0;
  private readonly queue: Array<() => void> = [];

  async sign(
    pdf: Buffer, p12: Buffer, signerName: string, page: number, x: number, y: number,
    signatureId: string, documentHash: string, signedAt: Date,
  ): Promise<Buffer> {
    return this.execute({
      operation: 'sign', p12Length: p12.length, signerName, page, x, y,
      signatureId, documentHash, signedAt: signedAt.toISOString(),
    }, pdf, p12);
  }

  async inspect(pdf: Buffer): Promise<{ present: boolean; valid: boolean }> {
    const result = await this.execute({ operation: 'inspect' }, pdf);
    try {
      const inspection = JSON.parse(result.toString('utf8')) as Record<string, unknown>;
      if (typeof inspection.present !== 'boolean' || typeof inspection.valid !== 'boolean') throw new Error();
      return { present: inspection.present, valid: inspection.valid };
    } catch {
      throw sandboxUnavailable();
    }
  }

  private async execute(job: PdfJob, pdf: Buffer, key?: Buffer): Promise<Buffer> {
    const header = Buffer.from(JSON.stringify(job), 'utf8');
    if (pdf.length > PDF_LIMIT || header.length > PDF_HEADER_LIMIT || (key && key.length > P12_LIMIT)) {
      throw documentRejected();
    }

    await this.acquire(pdf.length);
    try {
      return await this.runContainer(header, pdf, job.operation === 'inspect' ? 1024 : PDF_OUTPUT_LIMIT, key);
    } finally {
      this.inFlightBytes -= pdf.length;
      const next = this.queue.shift();
      if (next) next();
      else this.running -= 1;
    }
  }

  private async acquire(bytes: number): Promise<void> {
    if (this.queue.length >= MAX_QUEUED || this.inFlightBytes + bytes > MAX_IN_FLIGHT_BYTES) {
      throw sandboxUnavailable();
    }
    this.inFlightBytes += bytes;
    if (this.running < MAX_RUNNING) {
      this.running += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const takeSlot = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        this.queue.splice(this.queue.indexOf(takeSlot), 1);
        this.inFlightBytes -= bytes;
        reject(sandboxUnavailable());
      }, QUEUE_DEADLINE_MS);
      this.queue.push(takeSlot);
    });
  }

  private async runContainer(header: Buffer, pdf: Buffer, limit: number, key?: Buffer): Promise<Buffer> {
    const name = `assinatura-pdf-${randomUUID()}`;
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(header.length);
    const child = spawn('docker', [
      'run', '--rm', '-i', '--name', name, ...PDF_ISOLATION_ARGS, PDF_IMAGE,
    ], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });

    const chunks: Buffer[] = [];
    let received = 0;
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(interrupt, PDF_JOB_TIMEOUT_MS);
    try {
      const completed = new Promise<number | null>((resolve) => {
        child.once('error', () => resolve(null));
        child.once('close', (code) => resolve(code));
        child.stdout.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > limit) interrupt();
          else chunks.push(chunk);
        });
        child.stdin.on('error', () => undefined);
      });
      child.stdin.write(prefix);
      child.stdin.write(header);
      if (key) child.stdin.write(key);
      child.stdin.end(pdf);
      const code = await completed;
      if (code === 2 && !interrupted) throw documentRejected();
      if (code !== 0 || interrupted || received === 0) throw sandboxUnavailable();
      return Buffer.concat(chunks, received);
    } finally {
      clearTimeout(timer);
      if (interrupted) {
        await new Promise<void>((resolve) => {
          execFile('docker', ['rm', '--force', name], { timeout: 4000, windowsHide: true }, () => resolve());
        });
      }
    }
  }
}
