import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  codeForHttpStatus,
  isApiErrorCode,
} from '../errors/api-error-codes';
import { ApiException } from '../errors/api.exception';

interface ApiErrorResponse {
  code: string;
  message: string;
  timestamp: string;
  path: string;
}

/**
 * Converts framework and unexpected exceptions into a stable, non-sensitive
 * response. Detailed exceptions must never cross the HTTP boundary.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status = this.getStatus(exception);
    const body: ApiErrorResponse = {
      code: this.getCode(exception, status),
      message: this.getMessage(exception, status),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private getStatus(exception: unknown): number {
    if (!(exception instanceof HttpException)) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const status = exception.getStatus();
    return status >= 400 && status <= 599
      ? status
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getCode(exception: unknown, status: number): string {
    if (exception instanceof ApiException && isApiErrorCode(exception.code)) {
      return exception.code;
    }

    return codeForHttpStatus(status);
  }

  private getMessage(exception: unknown, status: number): string {
    if (exception instanceof ApiException) {
      return exception.publicMessage;
    }

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Invalid request';
      case HttpStatus.UNAUTHORIZED:
        return 'Authentication required';
      case HttpStatus.FORBIDDEN:
        return 'Access denied';
      case HttpStatus.NOT_FOUND:
        return 'Resource not found';
      case HttpStatus.METHOD_NOT_ALLOWED:
        return 'Method not allowed';
      default:
        return status >= 500 ? 'Internal server error' : 'Request rejected';
    }
  }
}
