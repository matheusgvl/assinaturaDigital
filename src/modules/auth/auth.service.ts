import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { API_ERROR_CODES } from '../../common/http/errors/api-error-codes';
import { ApiException } from '../../common/http/errors/api.exception';
import { hashPassword, verifyPassword } from './password-hasher';
import { validatePasswordPolicy } from './password-policy';
import { LoginDto, RegisterDto, type AuthenticatedUser } from './auth.dto';
import { AuthTokenService } from './auth-token.service';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_AUTH_MESSAGE = 'Invalid credentials';
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$WhqvQoik9/MM15Vt/YFRZA$AEuc3USo+mn1vN2yy4H0otBgilQBF7Ho++UAwOvpsNc';

function authError(): ApiException {
  return new ApiException(
    API_ERROR_CODES.AUTHENTICATION,
    HttpStatus.UNAUTHORIZED,
    GENERIC_AUTH_MESSAGE,
  );
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<Pick<User, 'id' | 'name' | 'email'>> {
    validatePasswordPolicy(dto.password);
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        HttpStatus.CONFLICT,
        'Unable to create account',
      );
    }

    const user = this.users.create({
      id: randomUUID(),
      name: dto.name.trim(),
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      failedLoginAttempts: 0,
      lockedUntil: null,
      totpEnabled: false,
    });

    try {
      const saved = await this.users.save(user);
      return { id: saved.id, name: saved.name, email: saved.email };
    } catch {
      throw new ApiException(
        API_ERROR_CODES.AUTHENTICATION,
        HttpStatus.CONFLICT,
        'Unable to create account',
      );
    }
  }

  async login(
    dto: LoginDto,
    userAgent: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await verifyPassword(dto.password, passwordHash);
    const now = new Date();

    if (!user || (user.lockedUntil && user.lockedUntil > now) || !passwordMatches) {
      if (user && (!user.lockedUntil || user.lockedUntil <= now)) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
          user.lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
        }
        await this.users.save(user);
      }
      throw authError();
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.users.save(user);

    const authenticatedUser = { id: user.id, email: user.email };
    const refreshToken = randomBytes(32).toString('base64url');
    await this.sessions.save(
      this.sessions.create({
        id: randomUUID(),
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        userAgent: userAgent?.slice(0, 512) ?? null,
      }),
    );

    return {
      accessToken: this.tokens.issueAccessToken(authenticatedUser),
      refreshToken,
      user: authenticatedUser,
    };
  }

  async refresh(
    refreshToken: string,
    userAgent: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
      relations: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || !session.user) {
      throw authError();
    }

    session.revokedAt = now;
    await this.sessions.save(session);
    const rotatedToken = randomBytes(32).toString('base64url');
    await this.sessions.save(
      this.sessions.create({
        id: randomUUID(),
        userId: session.user.id,
        refreshTokenHash: hashRefreshToken(rotatedToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        userAgent: userAgent?.slice(0, 512) ?? null,
      }),
    );

    return {
      accessToken: this.tokens.issueAccessToken({
        id: session.user.id,
        email: session.user.email,
      }),
      refreshToken: rotatedToken,
    };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    });
    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }
  }

  getUser(userId: string): Promise<User | null> {
    return this.users.findOne({ where: { id: userId } });
  }
}
