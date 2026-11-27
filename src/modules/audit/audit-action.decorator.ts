import { SetMetadata } from '@nestjs/common';
import type { AuditAction as Action } from './entities/audit-event.entity';

export const AUDIT_ACTION = Symbol('audited-action');

/** Marca os pontos onde a auditoria deve registrar o resultado da operação. */
export const AuditAction = (action: Action) => SetMetadata(AUDIT_ACTION, action);
