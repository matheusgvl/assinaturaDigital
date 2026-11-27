import { HttpStatus } from '@nestjs/common';

export const API_ERROR_CODES = {
  API: 'API_001',
  AUTHENTICATION: 'AUTH_001',
  AUTHORIZATION: 'AUTH_002',
  DOCUMENT: 'DOC_001',
  VALIDATION: 'VAL_001',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export function codeForHttpStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return API_ERROR_CODES.VALIDATION;
    case HttpStatus.UNAUTHORIZED:
      return API_ERROR_CODES.AUTHENTICATION;
    case HttpStatus.FORBIDDEN:
      return API_ERROR_CODES.AUTHORIZATION;
    default:
      return API_ERROR_CODES.API;
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return Object.values(API_ERROR_CODES).includes(value as ApiErrorCode);
}
