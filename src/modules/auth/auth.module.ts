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
import { TotpLoginTransaction } from './entities/totp-login-transaction.entity';
import { TotpLoginService } from './totp-login.service';
import { SecurityAlert } from './entities/security-alert.entity';
import { KnownLoginIp } from './entities/known-login-ip.entity';
import { TotpAlertService } from './totp-alert.service';
import { PasskeyService } from './passkey.service';
import { SigningKeysModule } from '../documents/signing-keys.module';

@Module({
  imports: [
    SigningKeysModule,
    TypeOrmModule.forFeature([
      User,
      Session,
      AccessTokenDenylist,
      TotpSecret,
      TotpRecoveryCode,
      TotpLoginTransaction,
      SecurityAlert,
      KnownLoginIp,
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
    TotpLoginService,
    TotpAlertService,
    PasskeyService,
  ],
  exports: [
    AuthService,
    AuthTokenService,
    AccessTokenPolicyService,
    JwtAuthGuard,
    TotpEnrollmentService,
    TotpRecoveryService,
    TotpLoginService,
    TotpAlertService,
  ],
})
export class AuthModule {}
