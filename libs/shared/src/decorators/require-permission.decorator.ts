import { SetMetadata } from '@nestjs/common';
import { Permission } from '../types/permission';

export const PERMISSION_KEY = 'permission';

/**
 * 权限装饰器
 *
 * 用法:
 *   @RequirePermission('product:read')
 *   @Get('products')
 *   list() { ... }
 *
 * 多个权限 (AND 语义, 必须全部满足):
 *   @RequirePermission('product:read', 'product:write')
 */
export const RequirePermission = (...perms: Permission[]) =>
  SetMetadata(PERMISSION_KEY, perms);
