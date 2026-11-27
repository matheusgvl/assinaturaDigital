import {
  Controller,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { SignDocumentDto } from './document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('sign')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async sign(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;
    const dto = new SignDocumentDto();
    dto.page = Number(body.page);
    dto.x = Number(body.x);
    dto.y = Number(body.y);
    const result = await this.documents.sign(file, dto, request.user.id);
    response
      .status(200)
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
      .send(result.buffer);
  }

  @Post('verify')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  verify(@UploadedFile() file: Express.Multer.File, @Req() request: Request) {
    return this.documents.verify(file, request.ip ?? 'unknown');
  }
}
