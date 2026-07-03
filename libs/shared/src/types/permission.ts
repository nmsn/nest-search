/**
 * 权限类型 (resource:action 形式)
 *
 * 使用:
 *   - 'product:read'  读产品
 *   - 'product:write' 写产品
 *   - 'system:admin'  超级权限
 */
export type Permission =
  // 产品
  | 'product:read'
  | 'product:write'
  | 'product:delete'
  // 订单
  | 'order:read'
  | 'order:write'
  // 用户
  | 'user:read'
  | 'user:manage'
  // 同步
  | 'sync:trigger'
  // 系统
  | 'system:admin';
