import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig, { validateEnvironment } from './config/app.config';
import databaseConfig from './config/database.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
