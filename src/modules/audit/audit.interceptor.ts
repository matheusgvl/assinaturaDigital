import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, concatMap, from, map, throwError } from 'rxjs';
import { AUDIT_ACTION } from './audit-action.decorator';
import { AuditService, type AuditedRequest } from './audit.service';
import type { AuditAction, AuditResult } from './entities/audit-event.entity';

type Event = { action: AuditAction; result: AuditResult };

/** Registra o desfecho da rota antes de sua resposta sair para o cliente. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const action = this.reflector.get<AuditAction | undefined>(AUDIT_ACTION, context.getHandler());
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest<AuditedRequest>();
    return next.handle().pipe(
      catchError((error: unknown) => {
        const events: Event[] = [{ action, result: 'failure' }];
        const status = error instanceof HttpException ? error.getStatus() : 500;
        if (
          ['login', 'token_issued', 'password_change'].includes(action) &&
          [400, 401, 403, 429].includes(status)
        ) events.push({ action: 'auth_failure', result: 'failure' });
        return from(this.audit.record(request, events)).pipe(concatMap(() => throwError(() => error)));
      }),
      concatMap((value: unknown) => {
        const response = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const result = response.requiresSecondFactor === true ? 'pending'
          : action === 'document_verify' && response.status !== 'valid' ? 'failure' : 'success';
        const events: Event[] = [{ action, result }];
        if (action === 'login' && typeof response.accessToken === 'string') {
          events.push({ action: 'token_issued', result: 'success' });
        }
        const user = response.user as { id?: unknown } | undefined;
        const userId = typeof user?.id === 'string' ? user.id : undefined;
        return from(this.audit.record(request, events, userId)).pipe(map(() => value));
      }),
    );
  }
}
