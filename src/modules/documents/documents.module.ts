import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { DocumentSignature } from './entities/document-signature.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentRateLimitService } from './document-rate-limit.service';
import { PdfFileService } from './pdf-file.service';
import { PdfSandboxService } from './pdf-sandbox.service';
import { SigningKeysModule } from './signing-keys.module';

@Module({
  imports: [
    AuthModule,
    SigningKeysModule,
    TypeOrmModule.forFeature([User, DocumentSignature]),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentRateLimitService,
    PdfFileService,
    PdfSandboxService,
  ],
})
export class DocumentsModule {}
