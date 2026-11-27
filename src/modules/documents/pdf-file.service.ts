import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

function invalidPdf(): ApiException {
  return new ApiException(
    API_ERROR_CODES.DOCUMENT,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'The uploaded file is not an accepted PDF',
  );
}

@Injectable()
export class PdfFileService {
  validate(file: Express.Multer.File): Buffer {
    if (!file?.buffer || file.size <= 0 || file.size > MAX_PDF_BYTES) {
      throw invalidPdf();
    }

    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw invalidPdf();
    }

    // Active PDF actions are not needed by this application and are rejected
    // before pdf-lib parses the input.
    if (/\/(?:JavaScript|JS|AA)\b/i.test(file.buffer.toString('latin1'))) {
      throw invalidPdf();
    }

    return file.buffer;
  }

  sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
