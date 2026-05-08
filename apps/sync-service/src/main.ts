import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { RABBITMQ_CONFIG } from '@app/shared';

async function bootstrap() {
  // Start as hybrid: HTTP + Microservice
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Connect to RabbitMQ as microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_CONFIG.url],
      queue: 'sync-service-consumer',
      queueOptions: { durable: false },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.SYNC_SERVICE_PORT || 3001;
  await app.listen(port);
  console.log(`Sync Service running on port ${port} (HTTP + RabbitMQ)`);
}
bootstrap();
