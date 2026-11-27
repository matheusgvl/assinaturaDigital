import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from '../../common/http/errors/api.exception';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from './jwt-auth.guard';
import { AuthService, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_TTL_MS } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const entry = header.split(';').find((part) => part.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : undefined;
}

function setRefreshCookie(response: Response, token: string): void {
  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
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
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = readCookie(request, REFRESH_TOKEN_COOKIE);
    if (!token) throw new ApiException('AUTH_001', 401, 'Authentication required');
    const result = await this.auth.refresh(token, request.headers['user-agent']);
    setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request, REFRESH_TOKEN_COOKIE);
    if (token) await this.auth.revokeRefreshToken(token);
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
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
}
