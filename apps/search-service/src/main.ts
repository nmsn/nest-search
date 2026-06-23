import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = app.get(ConfigService).getOrThrow<number>('SEARCH_SERVICE_PORT');
  await app.listen(port);
  console.log(`Search Service running on port ${port}`);
}
bootstrap();
