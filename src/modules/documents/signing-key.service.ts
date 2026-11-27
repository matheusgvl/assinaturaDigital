import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import forge from 'node-forge';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { SigningKey } from './entities/signing-key.entity';

const AES_ALGORITHM = 'aes-256-gcm';
const P12_PASSPHRASE = '';

function configurationError(): ApiException {
  return new ApiException(
    API_ERROR_CODES.DOCUMENT,
    500,
    'Document signing is not configured',
  );
}

function createPkcs12(userName: string): Buffer {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
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

  async getP12(userId: string, userName: string): Promise<Buffer> {
    const existing = await this.keys.findOne({ where: { userId } });
    if (existing) return this.decrypt(existing);

    const p12 = createPkcs12(userName);
    const encrypted = this.encrypt(p12);
    p12.fill(0);
    try {
      await this.keys.save(
        this.keys.create({ id: randomUUID(), userId, ...encrypted }),
      );
    } catch {
      const concurrent = await this.keys.findOne({ where: { userId } });
      if (concurrent) return this.decrypt(concurrent);
      throw configurationError();
    }
    const stored = await this.keys.findOneOrFail({ where: { userId } });
    return this.decrypt(stored);
  }

  private masterKey(): Buffer {
    const encoded = this.config.get<string>('app.pdfMasterKeyB64');
    if (!encoded) throw configurationError();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) {
      throw configurationError();
    }
    return key;
  }

  private encrypt(value: Buffer): Pick<SigningKey, 'encryptedP12' | 'iv' | 'authTag'> {
    const iv = randomBytes(12);
    const cipher = createCipheriv(AES_ALGORITHM, this.masterKey(), iv);
    const encryptedP12 = Buffer.concat([cipher.update(value), cipher.final()]);
    return { encryptedP12, iv, authTag: cipher.getAuthTag() };
  }

  private decrypt(key: SigningKey): Buffer {
    try {
      const decipher = createDecipheriv(AES_ALGORITHM, this.masterKey(), key.iv);
      decipher.setAuthTag(key.authTag);
      return Buffer.concat([decipher.update(key.encryptedP12), decipher.final()]);
    } catch {
      throw configurationError();
    }
  }
}
