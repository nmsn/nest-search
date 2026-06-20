import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. 读 @Roles metadata
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. 没有 @Roles = 不限制,放行
    if (!requiredRoles || requiredRoles.length === 0) return true;

    // 3. 从 request 拿 user roles(本节简化:从 header 读)
    const req = context.switchToHttp().getRequest();
    const userRolesHeader = req.headers['x-user-roles'];
    const userRoles: string[] = typeof userRolesHeader === 'string'
      ? userRolesHeader.split(',').map(r => r.trim())
      : [];

    // 4. 用户有任意一个所需角色即可
    return requiredRoles.some(role => userRoles.includes(role));
  }
}