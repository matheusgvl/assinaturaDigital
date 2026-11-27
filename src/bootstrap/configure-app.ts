import { INestApplication } from '@nestjs/common';

/** Applies the shared HTTP configuration used by the real server and tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  return app;
}
