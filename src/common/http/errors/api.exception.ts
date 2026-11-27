import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from './api-error-codes';

/** An application exception whose code and message are explicitly public. */
export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly publicMessage: string;

  constructor(code: ApiErrorCode, status: HttpStatus, publicMessage: string) {
    super(publicMessage, status);
    this.code = code;
    this.publicMessage = publicMessage;
  }
}
