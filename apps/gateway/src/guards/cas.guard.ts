import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG } from '../libs/shared/constants/cas';
import { JwtPayload, AuthUser } from '../libs/shared/interfaces/user.interface';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

@Injectable()
export class CasGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      return true; // Let ApiKeyGuard handle if no Bearer token
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, CAS_CONFIG.jwtSecret) as unknown as JwtPayload;
      request.user = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
