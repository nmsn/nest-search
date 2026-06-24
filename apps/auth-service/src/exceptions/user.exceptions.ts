// apps/auth-service/src/exceptions/user.exceptions.ts
import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "./business.exception";

export class UserNotFoundException extends BusinessException {
  constructor(identifier: string | number) {
    super(
      "USER_NOT_FOUND",
      `User not found: ${identifier}`,
      HttpStatus.NOT_FOUND, // 404
    );
  }
}

export class UsernameConflictException extends BusinessException {
  constructor(username: string) {
    super(
      "USERNAME_CONFLICT",
      `Username already exists: ${username}`,
      HttpStatus.CONFLICT, // 409
    );
  }
}

export class UserDisabledException extends BusinessException {
  constructor(userId: number) {
    super(
      "USER_DISABLED",
      `User account is disabled: ${userId}`,
      HttpStatus.FORBIDDEN, // 403
    );
  }
}
