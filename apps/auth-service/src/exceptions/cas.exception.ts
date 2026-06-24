// apps/auth-service/src/exceptions/cas.exceptions.ts
import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "./business.exception";

export class CasServiceNotRegisteredException extends BusinessException {
  constructor(serviceUrl: string) {
    super(
      "CAS_SERVICE_NOT_REGISTERED",
      `CAS service not registered: ${serviceUrl}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CasTicketExpiredException extends BusinessException {
  constructor(ticket: string) {
    super(
      "CAS_TICKET_EXPIRED",
      `CAS ticket expired: ${ticket}`,
      HttpStatus.UNAUTHORIZED,  // 401
    );
  }
}

export class CasTicketInvalidException extends BusinessException {
  constructor(ticket: string) {
    super(
      "CAS_TICKET_INVALID",
      `CAS ticket invalid: ${ticket}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CasTgtInvalidException extends BusinessException {
  constructor(ticket: string) {
    super(
      "CAS_TGT_INVALID",
      `Invalid or expired TGT: ${ticket}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CasTicketMismatchException extends BusinessException {
  constructor(ticket: string, serviceUrl: string) {
    super(
      "CAS_TICKET_MISMATCH",
      `Service URL mismatch for ticket ${ticket}, expected: ${serviceUrl}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}