import { IsObject, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class PasskeyRegistrationOptionsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;
}

/** O envelope é validado aqui e a resposta do autenticador pela biblioteca. */
export class PasskeyVerificationDto {
  @IsUUID('4')
  challengeId!: string;

  @IsObject()
  credential!: Record<string, unknown>;
}
