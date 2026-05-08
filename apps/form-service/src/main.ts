import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = process.env.FORM_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`Form Service running on port ${port}`);
}
bootstrap();
