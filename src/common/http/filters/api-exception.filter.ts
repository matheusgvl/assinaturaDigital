import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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
      code: this.getCode(),
      message: this.getMessage(status),
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

  private getCode(): string {
    return 'API_001';
  }

  private getMessage(status: number): string {
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
