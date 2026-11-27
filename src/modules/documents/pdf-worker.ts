import { PdfSignatureService } from './pdf-signature.service';
import { loadPassivePdf } from './pdf-structure';
import { PDF_HEADER_LIMIT, PDF_LIMIT, PDF_OUTPUT_LIMIT, P12_LIMIT, type PdfJob } from './pdf-worker-protocol';

/** Lê um único trabalho, limitado em bytes, sem consultar arquivos ou rede. */
async function main() {
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const value of process.stdin) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as string);
      chunks.push(chunk);
      length += chunk.length;
      if (length > PDF_LIMIT + PDF_HEADER_LIMIT + P12_LIMIT + 4) throw new Error();
    }

    const input = Buffer.concat(chunks);
    try {
      const headerLength = input.readUInt32BE(0);
      if (headerLength === 0 || headerLength > PDF_HEADER_LIMIT || headerLength + 4 > input.length) {
        throw new Error();
      }
      const job = JSON.parse(input.toString('utf8', 4, 4 + headerLength)) as PdfJob;
      const payload = input.subarray(4 + headerLength);
      const p12Length = job.operation === 'sign' ? job.p12Length : 0;
      const pdf = payload.subarray(p12Length);
      if (
        !Number.isInteger(p12Length) || p12Length < 0 || p12Length > P12_LIMIT ||
        pdf.length > PDF_LIMIT || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))
      ) throw new Error();

      const service = new PdfSignatureService();
      if (job.operation === 'sign') {
        if (p12Length === 0 || !Number.isInteger(job.page) || !Number.isFinite(job.x) || !Number.isFinite(job.y)) {
          throw new Error();
        }
        const result = await service.sign(
          pdf, payload.subarray(0, p12Length), job.signerName, job.page, job.x, job.y,
          job.signatureId, job.documentHash, new Date(job.signedAt),
        );
        if (result.length > PDF_OUTPUT_LIMIT) throw new Error();
        process.stdout.write(result);
      } else if (job.operation === 'inspect') {
        await loadPassivePdf(pdf);
        const { present, valid } = service.inspect(pdf);
        process.stdout.write(JSON.stringify({ present, valid }));
      } else {
        throw new Error();
      }
    } finally {
      input.fill(0);
    }
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

void main().catch(() => {
  // A API recebe somente um código de status. Erros do parsing podem conter dados do arquivo.
  process.exitCode = 2;
});
