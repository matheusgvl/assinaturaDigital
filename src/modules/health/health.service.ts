import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus(): { status: 'ok'; service: 'assinatura-digital-api' } {
    return { status: 'ok', service: 'assinatura-digital-api' };
  }
}
