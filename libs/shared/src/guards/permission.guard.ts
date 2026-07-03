import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../types/permission';
import { ROLE_PERMISSIONS } from '../constants/permissions';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * 权限 Guard
 *
 * 用法:
 *   @UseGuards(CasGuard, PermissionGuard)  // CasGuard 验证 JWT, PermissionGuard 检查权限
 *
 * 工作流:
 *   1. 拿装饰器要求的权限
 *   2. 拿 JWT 里的 user (CasGuard 挂的)
 *   3. 查 user.role 的所有权限
 *   4. admin (system:admin) 直接通过
 *   5. 否则检查 required 权限是否都被满足 (AND)
 *   6. 不足抛 403
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // 1. 拿装饰器要求的权限
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // 2. 没有装饰器, 不需要权限检查
    if (!required || required.length === 0) return true;

    // 3. 拿用户 (JWT 验证后由 CasGuard 挂到 request.user)
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user || !user.role) {
      throw new ForbiddenException('未认证或缺少 role');
    }

    // 4. 拿用户角色的所有权限
    const userPerms = ROLE_PERMISSIONS[user.role] || [];

    // 5. admin (system:admin) 一律通过
    if (userPerms.includes('system:admin')) return true;

    // 6. 检查每个 required 权限
    for (const perm of required) {
      if (!userPerms.includes(perm)) {
        throw new ForbiddenException(
          `权限不足: 缺少 ${perm} 权限`,
        );
      }
    }

    return true;
  }
}
