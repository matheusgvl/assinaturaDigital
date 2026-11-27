import { Injectable } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import type { AuthenticatedUser } from './auth.dto';

const PRIVATE_KEY_ENV = 'JWT_PRIVATE_KEY_B64';
const PUBLIC_KEY_ENV = 'JWT_PUBLIC_KEY_B64';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

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
  issueAccessToken(user: AuthenticatedUser): string {
    return jwt.sign({ email: user.email }, readKey(PRIVATE_KEY_ENV), {
      algorithm: 'RS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      subject: user.id,
    });
  }

  verifyAccessToken(token: string): AuthenticatedUser {
    try {
      const payload = jwt.verify(token, readKey(PUBLIC_KEY_ENV), {
        algorithms: ['RS256'],
      }) as JwtPayload;

      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new Error('Invalid token claims');
      }

      return { id: payload.sub, email: payload.email };
    } catch {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        401,
        'Authentication required',
      );
    }
  }
}
