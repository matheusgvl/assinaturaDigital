import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(3000);
}

void bootstrap();
