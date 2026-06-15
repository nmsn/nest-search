import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // ✅ 关键: 只 log 5xx,4xx 静默
    if (status >= 500) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        "unhandled exception",
      );
    } else {
      this.logger.debug(
        { status, path: request.url },
        "client error (expected)",
      );
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    response.status(status).json({
      statusCode: status,
      message:
        typeof message === "string"
          ? message
          : (message as any).message || message,
      error:
        typeof message === "string"
          ? message
          : (message as any).error || "Error",
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
