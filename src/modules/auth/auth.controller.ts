import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiException } from '../../common/http/errors/api.exception';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from './jwt-auth.guard';
import { AuthService, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_TTL_MS } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

export const CSRF_TOKEN_COOKIE = 'csrf_token';

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const entry = header.split(';').find((part) => part.trim().startsWith(`${name}=`));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.trim().slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function setRefreshCookie(response: Response, token: string): void {
  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function setCsrfCookie(response: Response, token: string): void {
  response.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function csrfTokenIsValid(request: Request): boolean {
  const cookieToken = readCookie(request, CSRF_TOKEN_COOKIE);
  const headerToken = request.headers['x-csrf-token'];
  const headerValue = Array.isArray(headerToken) ? undefined : headerToken;
  if (!cookieToken || !headerValue) return false;

  const cookieDigest = createHash('sha256').update(cookieToken).digest();
  const headerDigest = createHash('sha256').update(headerValue).digest();
  return timingSafeEqual(cookieDigest, headerDigest) && cookieToken === headerValue;
}

function assertCsrf(request: Request): void {
  if (!csrfTokenIsValid(request)) {
    throw new ApiException('AUTH_002', 403, 'CSRF validation failed');
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      dto,
      request.headers['user-agent'],
      request.ip ?? 'unknown',
    );
    setRefreshCookie(response, result.refreshToken);
    setCsrfCookie(response, randomBytes(32).toString('base64url'));
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertCsrf(request);
    const token = readCookie(request, REFRESH_TOKEN_COOKIE);
    if (!token) throw new ApiException('AUTH_001', 401, 'Authentication required');
    const result = await this.auth.refresh(token, request.headers['user-agent']);
    setRefreshCookie(response, result.refreshToken);
    setCsrfCookie(response, randomBytes(32).toString('base64url'));
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    assertCsrf(request);
    const token = readCookie(request, REFRESH_TOKEN_COOKIE);
    if (token) await this.auth.revokeRefreshToken(token);
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
    response.clearCookie(CSRF_TOKEN_COOKIE, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    const user = await this.auth.getUser(request.user.id);
    if (!user) throw new ApiException('AUTH_001', 401, 'Authentication required');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      totpEnabled: user.totpEnabled,
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@Req() request: AuthenticatedRequest) {
    return this.auth.listActiveSessions(request.user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('id') sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(request.user.id, sessionId);
  }

  @Post('sessions/revoke-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.revokeAllSessions(request.user.id);
  }
}
