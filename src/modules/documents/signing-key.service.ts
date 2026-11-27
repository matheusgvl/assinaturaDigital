import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import forge from 'node-forge';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { SigningKey } from './entities/signing-key.entity';

const AES_ALGORITHM = 'aes-256-gcm';
const P12_PASSPHRASE = '';
type RsaKeyPair = { publicKey: unknown; privateKey: unknown };

function configurationError(): ApiException {
  return new ApiException(
    API_ERROR_CODES.DOCUMENT,
    500,
    'Document signing is not configured',
  );
}

async function createPkcs12(userName: string): Promise<Buffer> {
  const keyPair = await new Promise<RsaKeyPair>((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 }, (error: Error | null, pair: RsaKeyPair) => {
      if (error) reject(error);
      else resolve(pair);
    });
  });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keyPair.publicKey;
  certificate.serialNumber = randomBytes(16).toString('hex');
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  const commonName = userName.trim().slice(0, 64) || 'Assinante';
  const subject = [{ name: 'commonName', value: commonName }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keyPair.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(
    keyPair.privateKey,
    certificate,
    P12_PASSPHRASE,
    { algorithm: '3des' },
  );
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

@Injectable()
export class SigningKeyService {
  constructor(
    @InjectRepository(SigningKey)
    private readonly keys: Repository<SigningKey>,
    private readonly config: ConfigService,
  ) {}

  /** Prepara a chave RSA individual cifrada antes da transação de cadastro. */
  async prepare(userName: string): Promise<Pick<SigningKey, 'encryptedP12' | 'iv' | 'authTag'>> {
    const p12 = await createPkcs12(userName).catch(() => { throw configurationError(); });
    try {
      return this.encrypt(p12);
    } finally {
      p12.fill(0);
    }
  }

  /** Grava a chave no mesmo commit que cria o usuário. */
  async provision(
    manager: EntityManager,
    userId: string,
    encrypted: Pick<SigningKey, 'encryptedP12' | 'iv' | 'authTag'>,
  ): Promise<void> {
    await manager.getRepository(SigningKey).insert({ id: randomUUID(), userId, ...encrypted });
  }

  /** Disponibiliza o PKCS#12 somente durante a operação interna de assinatura. */
  async withP12<T>(userId: string, userName: string, operation: (p12: Buffer) => Promise<T>): Promise<T> {
    const p12 = await this.getP12(userId, userName);
    try {
      return await operation(p12);
    } finally {
      p12.fill(0);
    }
  }

  private async getP12(userId: string, userName: string): Promise<Buffer> {
    const load = () => this.keys.findOne({
      where: { userId },
      select: { encryptedP12: true, iv: true, authTag: true },
    });
    const existing = await load();
    if (existing) return this.decrypt(existing);

    const encrypted = await this.prepare(userName);
    await this.keys.createQueryBuilder().insert()
      .values({ id: randomUUID(), userId, ...encrypted }).orIgnore().execute();
    const stored = await load();
    if (!stored) throw configurationError();
    return this.decrypt(stored);
  }

  private masterKey(): Buffer {
    const encoded = this.config.get<string>('app.pdfMasterKeyB64');
    if (!encoded) throw configurationError();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) {
      key.fill(0);
      throw configurationError();
    }
    return key;
  }

  private encrypt(value: Buffer): Pick<SigningKey, 'encryptedP12' | 'iv' | 'authTag'> {
    const iv = randomBytes(12);
    const master = this.masterKey();
    try {
      const cipher = createCipheriv(AES_ALGORITHM, master, iv);
      const encryptedP12 = Buffer.concat([cipher.update(value), cipher.final()]);
      return { encryptedP12, iv, authTag: cipher.getAuthTag() };
    } finally {
      master.fill(0);
    }
  }

  private decrypt(key: SigningKey): Buffer {
    const master = this.masterKey();
    let part: Buffer | undefined;
    let tail: Buffer | undefined;
    try {
      const decipher = createDecipheriv(AES_ALGORITHM, master, key.iv);
      decipher.setAuthTag(key.authTag);
      part = decipher.update(key.encryptedP12);
      tail = decipher.final();
      return Buffer.concat([part, tail]);
    } catch {
      throw configurationError();
    } finally {
      master.fill(0);
      part?.fill(0);
      tail?.fill(0);
    }
  }
}
