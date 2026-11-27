import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SigningKey } from './entities/signing-key.entity';
import { SigningKeyService } from './signing-key.service';

@Module({
  imports: [TypeOrmModule.forFeature([SigningKey])],
  providers: [SigningKeyService],
  exports: [SigningKeyService],
})
export class SigningKeysModule {}
