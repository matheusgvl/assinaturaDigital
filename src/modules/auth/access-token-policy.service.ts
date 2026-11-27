import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import type { AuthenticatedUser } from './auth.dto';
import { AuthTokenService } from './auth-token.service';
import { AccessTokenDenylist } from './entities/access-token-denylist.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';

function authenticationError(): ApiException {
  return new ApiException(
    API_ERROR_CODES.AUTHENTICATION,
    HttpStatus.UNAUTHORIZED,
    'Authentication required',
  );
}

function hashContext(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Aplica as políticas de revogação e vinculação contextual de cada JWT. */
@Injectable()
export class AccessTokenPolicyService {
  private readonly logger = new Logger(AccessTokenPolicyService.name);

  constructor(
    private readonly tokens: AuthTokenService,
    @InjectRepository(AccessTokenDenylist)
    private readonly denylist: Repository<AccessTokenDenylist>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Valida assinatura, sessão, senha, UA e denylist antes de liberar a rota. */
  async authenticate(
    token: string,
    userAgent: string | undefined,
    ip: string,
  ): Promise<AuthenticatedUser> {
    const claims = this.tokens.verifyAccessToken(token);
    const now = new Date();
    const denied = await this.denylist.findOne({
      where: { jti: claims.jti, expiresAt: MoreThan(now) },
    });
    if (denied) throw authenticationError();

    const session = await this.sessions.findOne({
      where: { id: claims.sessionId, userId: claims.id },
    });
    const user = await this.users.findOne({ where: { id: claims.id } });
    if (
      !session ||
      !user ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !claims.iat ||
      Math.floor(user.passwordChangedAt.getTime() / 1000) > claims.iat
    ) {
      throw authenticationError();
    }

    const expectedUserAgentHash = hashContext(userAgent ?? '');
    if (claims.userAgentHash !== expectedUserAgentHash) {
      throw authenticationError();
    }

    if (claims.ipHash !== hashContext(ip)) {
      // Mudanca de IP e apenas um alerta: bloquear por IP quebra redes moveis,
      // proxies e balanceadores e nao substitui a validacao do token.
      this.logger.warn(`JWT IP changed for session ${claims.sessionId}`);
    }

    return claims;
  }

  async hasActiveSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.sessions.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    return Boolean(session);
  }
}
