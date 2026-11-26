import { Injectable } from '@nestjs/common';
import { HealthResponse } from './health-response.interface';

@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return { status: 'ok', service: 'assinatura-digital-api' };
  }
}
