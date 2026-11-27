import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Repository } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { User } from '../auth/entities/user.entity';
import { SignDocumentDto } from './document.dto';
import { DocumentSignature } from './entities/document-signature.entity';
import { DocumentRateLimitService } from './document-rate-limit.service';
import { PdfFileService } from './pdf-file.service';
import { PdfSignatureService } from './pdf-signature.service';
import { SigningKeyService } from './signing-key.service';

const SIGNING_FAILURE = 'Unable to sign this PDF';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(DocumentSignature)
    private readonly signatures: Repository<DocumentSignature>,
    private readonly files: PdfFileService,
    private readonly keys: SigningKeyService,
    private readonly pdfs: PdfSignatureService,
    private readonly rateLimit: DocumentRateLimitService,
  ) {}

  async sign(
    file: Express.Multer.File,
    dto: SignDocumentDto,
    userId: string,
    sourceIp: string | undefined,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    if (!sourceIp || !isIP(sourceIp)) {
      throw new ApiException(API_ERROR_CODES.DOCUMENT, HttpStatus.INTERNAL_SERVER_ERROR, SIGNING_FAILURE);
    }
    const original = this.files.validate(file);
    const originalHash = this.files.sha256(original);
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new ApiException(API_ERROR_CODES.AUTHENTICATION, HttpStatus.UNAUTHORIZED, 'Authentication required');
    }
    const id = randomUUID();
    const signedAt = new Date();
    const p12 = await this.keys.getP12(user.id, user.name);
    try {
      let signed: Buffer;
      try {
        signed = await this.pdfs.sign(
          original,
          p12,
          user.name,
          dto.page,
          dto.x,
          dto.y,
          id,
          originalHash,
          signedAt,
        );
      } catch {
        throw new ApiException(API_ERROR_CODES.DOCUMENT, HttpStatus.UNPROCESSABLE_ENTITY, SIGNING_FAILURE);
      }
      await this.signatures.save(
        this.signatures.create({
          id,
          userId: user.id,
          originalHash,
          signedHash: this.files.sha256(signed),
          signerName: user.name,
          signedAt,
          sourceIp,
        }),
      );
      return { buffer: signed, fileName: 'documento-assinado.pdf' };
    } finally {
      p12.fill(0);
    }
  }

  async verify(file: Express.Multer.File, ip: string) {
    await this.rateLimit.consume(ip);
    const pdf = this.files.validate(file);
    const inspection = this.pdfs.inspect(pdf);
    if (!inspection.present) return { status: 'not_found' as const };
    if (!inspection.valid) return { status: 'tampered' as const };
    const record = await this.signatures.findOne({
      where: { signedHash: this.files.sha256(pdf) },
    });
    if (!record) return { status: 'not_found' as const };
    return {
      status: 'valid' as const,
      signer: record.signerName,
      signedAt: record.signedAt.toISOString(),
      signatureId: record.id,
      documentHash: record.signedHash,
    };
  }
}
