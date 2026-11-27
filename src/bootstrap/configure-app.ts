import { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from '../common/http/filters/api-exception.filter';

/** Applies the shared HTTP configuration used by the real server and tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
