import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';


process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://auth.localhost:3100',
      'http://ds.localhost:3101',
      'http://zk.localhost:3102',
      'http://meeting.localhost:3103',
    ],
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = process.env.GATEWAY_PORT || 3000;
  await app.listen(port);
  console.log(`Gateway running on port ${port}`);
}
bootstrap();
