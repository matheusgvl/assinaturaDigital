import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AccessTokenPolicyService } from './access-token-policy.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { AccessTokenDenylist } from './entities/access-token-denylist.entity';
import { TotpSecret } from './entities/totp-secret.entity';
import { TotpEnrollmentService } from './totp-enrollment.service';
import { TotpRecoveryCode } from './entities/totp-recovery-code.entity';
import { TotpRecoveryService } from './totp-recovery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      AccessTokenDenylist,
      TotpSecret,
      TotpRecoveryCode,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AccessTokenPolicyService,
    JwtAuthGuard,
    LoginRateLimitService,
    TotpEnrollmentService,
    TotpRecoveryService,
  ],
  exports: [
    AuthService,
    AuthTokenService,
    AccessTokenPolicyService,
    JwtAuthGuard,
    TotpEnrollmentService,
    TotpRecoveryService,
  ],
})
export class AuthModule {}
