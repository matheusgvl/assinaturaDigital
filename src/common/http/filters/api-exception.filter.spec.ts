import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

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
      code: 'API_001',
      message: 'Invalid request',
      timestamp: expect.any(String),
      path: '/sensitive',
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'database password',
    );
  });

  it('does not expose details from unexpected exceptions', () => {
    const filter = new ApiExceptionFilter();
    const { host, response } = createHost();

    filter.catch(new Error('SQL password=secret'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith({
      code: 'API_001',
      message: 'Internal server error',
      timestamp: expect.any(String),
      path: '/sensitive',
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toMatch(
      /SQL|secret|stack/i,
    );
  });
});
