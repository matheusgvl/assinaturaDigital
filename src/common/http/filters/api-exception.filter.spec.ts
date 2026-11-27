import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';
import { API_ERROR_CODES } from '../errors/api-error-codes';
import { ApiException } from '../errors/api.exception';

function createHost(): {
  host: ArgumentsHost;
  response: { status: jest.Mock; json: jest.Mock };
} {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { url: '/sensitive' };
  const http = {
    getResponse: () => response,
    getRequest: () => request,
  };
  const host = {
    switchToHttp: () => http,
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('ApiExceptionFilter', () => {
  it('returns a stable safe contract for framework exceptions', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new HttpException('database password', HttpStatus.BAD_REQUEST),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      code: API_ERROR_CODES.VALIDATION,
      message: 'Invalid request',
      timestamp: expect.any(String),
      path: '/sensitive',
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'database password',
    );
  });

  it('preserves only a known application code', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(
      new ApiException(
        API_ERROR_CODES.DOCUMENT,
        HttpStatus.NOT_FOUND,
        'Document not found',
      ),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      code: API_ERROR_CODES.DOCUMENT,
      message: 'Document not found',
      timestamp: expect.any(String),
      path: '/sensitive',
    });
  });

  it('does not expose details from unexpected exceptions', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(new Error('SQL password=secret'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith({
      code: API_ERROR_CODES.API,
      message: 'Internal server error',
      timestamp: expect.any(String),
      path: '/sensitive',
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toMatch(
      /SQL|secret|stack/i,
    );
  });
});
