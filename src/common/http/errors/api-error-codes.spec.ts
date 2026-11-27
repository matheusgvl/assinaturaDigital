import { HttpStatus } from '@nestjs/common';
import {
  API_ERROR_CODES,
  codeForHttpStatus,
  isApiErrorCode,
} from './api-error-codes';

describe('API error codes', () => {
  it('exposes stable codes for the supported domains', () => {
    expect(API_ERROR_CODES).toEqual({
      API: 'API_001',
      AUTHENTICATION: 'AUTH_001',
      AUTHORIZATION: 'AUTH_002',
      DOCUMENT: 'DOC_001',
      VALIDATION: 'VAL_001',
    });
  });

  it.each([
    [HttpStatus.BAD_REQUEST, API_ERROR_CODES.VALIDATION],
    [HttpStatus.UNAUTHORIZED, API_ERROR_CODES.AUTHENTICATION],
    [HttpStatus.FORBIDDEN, API_ERROR_CODES.AUTHORIZATION],
    [HttpStatus.NOT_FOUND, API_ERROR_CODES.API],
    [HttpStatus.INTERNAL_SERVER_ERROR, API_ERROR_CODES.API],
  ])('maps status %s to %s', (status, code) => {
    expect(codeForHttpStatus(status)).toBe(code);
  });

  it('rejects unknown codes', () => {
    expect(isApiErrorCode('AUTH_999')).toBe(false);
    expect(isApiErrorCode(API_ERROR_CODES.DOCUMENT)).toBe(true);
  });
});
