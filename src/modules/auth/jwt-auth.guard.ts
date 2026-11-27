import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.dto';
import { AccessTokenPolicyService } from './access-token-policy.service';

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly policy: AccessTokenPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    request.user = await this.policy.authenticate(
      token,
      request.headers['user-agent'],
      request.ip ?? 'unknown',
    );
    return true;
  }
}
