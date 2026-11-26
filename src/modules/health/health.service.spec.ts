import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns the API health contract without external dependencies', () => {
    expect(new HealthService().getStatus()).toEqual({
      status: 'ok',
      service: 'assinatura-digital-api',
    });
  });
});
