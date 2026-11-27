import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port);
}

void bootstrap();
