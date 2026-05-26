import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { isValidBusinessLine } from '../libs/shared/constants/business-lines';

const API_KEYS: Record<string, string> = {
  ds: process.env.API_KEY_DS || 'ds_key_123',
  zk: process.env.API_KEY_ZK || 'zk_key_456',
  meeting: process.env.API_KEY_MEETING || 'meeting_key_789',
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const path = request.route?.path || request.url;

    // Skip API key check for auth routes (no businessLine needed)
    if (path.startsWith('/api/auth/')) {
      return true;
    }

    // If user is already authenticated via CasGuard, skip API key check
    if (request.user) {
      return true;
    }

    const apiKey = request.headers['x-api-key'];
    const businessLine = request.params.businessLine;

    // If no API key and no user, reject
    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key or Authorization header');
    }

    if (!businessLine || !isValidBusinessLine(businessLine)) {
      return true; // Let the downstream service handle invalid business lines
    }

    const expectedKey = API_KEYS[businessLine];
    if (apiKey !== expectedKey) {
      throw new UnauthorizedException(`Invalid API key for business line: ${businessLine}`);
    }

    return true;
  }
}
