// apps/auth-service/src/exceptions/business.exception.ts
import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * 业务异常基类。
 * - errorCode:前端按这个字段做逻辑(不靠 message)
 * - httpStatus:默认 400,子类可覆盖
 */
export class BusinessException extends HttpException {
  public readonly errorCode: string;

  constructor(
    errorCode: string,
    message: string,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        statusCode: httpStatus,
        message,
        errorCode,
        error: HttpStatus[httpStatus],
      },
      httpStatus,
    );
    this.errorCode = errorCode;
  }
}
