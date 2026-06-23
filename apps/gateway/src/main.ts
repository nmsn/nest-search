import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      "http://auth.localhost:3100",
      "http://ds.localhost:3101",
      "http://zk.localhost:3102",
      "http://meeting.localhost:3103",
    ],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Nest-Search Gateway")
    .setDescription("API 网关 — 代理 auth / sync / search / form 4 个服务")
    .setVersion("1.0")
    .addApiKey({ type: "apiKey", name: "X-API-Key", in: "header" }, "X-API-Key")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api", app, document);

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剔除没在 DTO 里声明的字段
      transform: true, // 自动把 plain object 转成 DTO class instance
    }),
  );

  const port = app.get(ConfigService).getOrThrow<number>('GATEWAY_PORT');
  await app.listen(port);
  console.log(`Gateway running on port ${port}`);
}
bootstrap();
