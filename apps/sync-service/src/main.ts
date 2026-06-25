import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = app.get(ConfigService).getOrThrow<number>('SYNC_SERVICE_PORT');
  await app.listen(port);
  console.log(`Sync Service running on port ${port} (HTTP + BullMQ)`);
}
bootstrap();
