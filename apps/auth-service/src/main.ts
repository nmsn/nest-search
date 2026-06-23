import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // 从 ConfigService 取 port(Zod 已经校验必填 + 类型)
  const port = app.get(ConfigService).getOrThrow<number>('AUTH_SERVICE_PORT');
  await app.listen(port);
  console.log(`Auth Service running on port ${port}`);
}
bootstrap();
