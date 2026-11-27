import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuditAction } from '../audit/audit-action.decorator';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { SignDocumentDto } from './document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  @AuditAction('document_sign')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async sign(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SignDocumentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const result = await this.documents.sign(file, dto, request.user.id, request.ip ?? request.socket.remoteAddress);
    return new StreamableFile(result.buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${result.fileName}"`,
    });
  }

  @Post('verify')
  @AuditAction('document_verify')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  verify(@UploadedFile() file: Express.Multer.File, @Req() request: Request) {
    return this.documents.verify(file, request.ip ?? 'unknown');
  }
}
