import { INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ApiExceptionFilter } from '../common/http/filters/api-exception.filter';
import { API_ERROR_CODES } from '../common/http/errors/api-error-codes';
import { ApiException } from '../common/http/errors/api.exception';
import { resolveCorsOrigins } from '../config/app.config';

const VALIDATION_REASON_MESSAGES: Record<string, string> = {
  whitelistValidation: 'contains an unsupported field',
  isDefined: 'is required',
  isEmail: 'must be a valid email address',
  isString: 'must be text',
  isInt: 'must be an integer',
  isIn: 'contains an unsupported option',
};

function safeFieldName(property: string): string {
  const field = property.replace(/[^a-zA-Z0-9_.[\]-]/g, '').slice(0, 100);
  return field || 'request';
}

function validationDetails(errors: ValidationError[]): Readonly<Record<string, unknown>> {
  return {
    fields: errors.slice(0, 20).map((error) => ({
      field: safeFieldName(error.property),
      reasons: Object.keys(error.constraints ?? {})
        .slice(0, 5)
        .map((reason) => VALIDATION_REASON_MESSAGES[reason] ?? 'has an invalid value'),
    })),
  };
}

/** Applies the shared HTTP configuration used by the real server and tests. */
export function configureApp(
  app: INestApplication,
  corsOrigins = resolveCorsOrigins(process.env),
): INestApplication {
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ApiException(
          API_ERROR_CODES.VALIDATION,
          HttpStatus.BAD_REQUEST,
          'Validation failed',
          validationDetails(errors),
        ),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
