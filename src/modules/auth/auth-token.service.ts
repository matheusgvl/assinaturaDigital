import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import type { AuthenticatedUser } from './auth.dto';

const PRIVATE_KEY_ENV = 'JWT_PRIVATE_KEY_B64';
const PUBLIC_KEY_ENV = 'JWT_PUBLIC_KEY_B64';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type AccessTokenContext = {
  sessionId: string;
  ip: string;
  userAgent: string | undefined;
};

function contextHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readKey(environmentName: string): string {
  const encoded = process.env[environmentName];
  if (!encoded) {
    throw new Error('JWT signing keys are not configured');
  }

  try {
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    throw new Error('JWT signing keys are not configured');
  }
}

@Injectable()
export class AuthTokenService {
  /**
   * Emite um JWT curto vinculado à sessão e ao contexto de autenticação.
   *
   * O refresh token não participa deste método e permanece somente no cookie
   * HttpOnly. Os hashes de IP e User-Agent permitem detectar mudanças sem
   * registrar esses valores em claro.
   */
  issueAccessToken(
    user: AuthenticatedUser,
    context: AccessTokenContext,
  ): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        email: user.email,
        jti: randomUUID(),
        session_id: context.sessionId,
        ip_hash: contextHash(context.ip),
        ua_hash: contextHash(context.userAgent ?? ''),
        iat: issuedAt,
      },
      readKey(PRIVATE_KEY_ENV),
      {
        algorithm: 'RS256',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        subject: user.id,
      },
    );
  }

  /** Verifica assinatura, algoritmo, validade temporal e claims obrigatórios. */
  verifyAccessToken(token: string): AuthenticatedUser {
    try {
      const payload = jwt.verify(token, readKey(PUBLIC_KEY_ENV), {
        algorithms: ['RS256'],
      }) as JwtPayload;

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.jti !== 'string' ||
        typeof payload.session_id !== 'string' ||
        typeof payload.ip_hash !== 'string' ||
        typeof payload.ua_hash !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('Invalid token claims');
      }

      return {
        id: payload.sub,
        email: payload.email,
        sessionId: payload.session_id,
        jti: payload.jti,
        iat: payload.iat,
        ipHash: payload.ip_hash,
        userAgentHash: payload.ua_hash,
        exp: payload.exp,
      };
    } catch {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        401,
        'Authentication required',
      );
    }
  }
}
