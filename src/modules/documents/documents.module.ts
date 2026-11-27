import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { DocumentSignature } from './entities/document-signature.entity';
import { SigningKey } from './entities/signing-key.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfFileService } from './pdf-file.service';
import { PdfSignatureService } from './pdf-signature.service';
import { SigningKeyService } from './signing-key.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([User, SigningKey, DocumentSignature]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfFileService, PdfSignatureService, SigningKeyService],
})
export class DocumentsModule {}
