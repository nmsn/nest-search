import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  // Start as hybrid: HTTP + Microservice
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // 从 ConfigService 读 RabbitMQ URL(Zod 已校验必填 + URL 格式)
  const rabbitUrl = app.get(ConfigService).getOrThrow<string>('RABBITMQ_URL');

  // Connect to RabbitMQ as microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: 'sync-service-consumer',
      queueOptions: { durable: false },
    },
  });

  await app.startAllMicroservices();

  const port = app.get(ConfigService).getOrThrow<number>('SYNC_SERVICE_PORT');
  await app.listen(port);
  console.log(`Sync Service running on port ${port} (HTTP + RabbitMQ)`);
}
bootstrap();
