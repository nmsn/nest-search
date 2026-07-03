import { Permission } from '../types/permission';

/**
 * 角色 → 权限映射
 *
 * 设计原则:
 *  - admin: 拥有 system:admin 超级权限
 *  - manager: 业务管理 (产品/订单/同步)
 *  - user: 普通用户 (读产品, 写自己的订单)
 *  - guest: 只读产品
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['system:admin'],
  manager: [
    'product:read',
    'product:write',
    'product:delete',
    'order:read',
    'order:write',
    'user:read',
    'sync:trigger',
  ],
  user: ['product:read', 'order:read', 'order:write'],
  guest: ['product:read'],
};

/**
 * 检查角色是否拥有指定权限
 *  - admin (system:admin) 一律通过
 *  - 其他角色查表
 */
export function hasPermission(
  role: string | undefined,
  required: Permission,
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes('system:admin')) return true;
  return perms.includes(required);
}

/**
 * 检查角色是否拥有所有指定权限 (AND)
 */
export function hasAllPermissions(
  role: string | undefined,
  required: Permission[],
): boolean {
  return required.every((p) => hasPermission(role, p));
}
