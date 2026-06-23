import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isValidBusinessLine } from "../libs/shared/constants/business-lines";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../common/decorators";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  // 从 ConfigService 读 API key(替代 module-level const)
  private readonly apiKeys: Record<string, string>;

  constructor(
    private reflector: Reflector,
    config: ConfigService,
  ) {
    this.apiKeys = {
      ds: config.getOrThrow<string>("API_KEY_DS"),
      zk: config.getOrThrow<string>("API_KEY_ZK"),
      meeting: config.getOrThrow<string>("API_KEY_MEETING"),
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const path = request.route?.path || request.url;

    // Skip API key check for auth routes (no businessLine needed)
    if (path.startsWith("/api/auth/")) {
      return true;
    }

    // If user is already authenticated via CasGuard, skip API key check
    if (request.user) {
      return true;
    }

    const apiKey = request.headers["x-api-key"];
    const businessLine = request.params.businessLine;

    // If no API key and no user, reject
    if (!apiKey) {
      throw new UnauthorizedException(
        "Missing X-API-Key or Authorization header",
      );
    }

    if (!businessLine || !isValidBusinessLine(businessLine)) {
      return true; // Let the downstream service handle invalid business lines
    }

    const expectedKey = this.apiKeys[businessLine];
    if (apiKey !== expectedKey) {
      throw new UnauthorizedException(
        `Invalid API key for business line: ${businessLine}`,
      );
    }

    return true;
  }
}
