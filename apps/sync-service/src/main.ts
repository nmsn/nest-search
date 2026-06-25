import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const isProduction = config.getOrThrow<string>('NODE_ENV') === 'production';

  app.enableCors({
    origin: isProduction
      ? ['https://app.example.com']
      : [/^http:\/\/localhost:\d+$/],
    credentials: true,
  });

  app.use(helmet());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sync Service')
    .setDescription('同步服务 API (BullMQ + Elasticsearch)')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = app.get(ConfigService).getOrThrow<number>('SYNC_SERVICE_PORT');
  await app.listen(port);
  console.log(`Sync Service running on port ${port} (HTTP + BullMQ)`);
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
}
bootstrap();
