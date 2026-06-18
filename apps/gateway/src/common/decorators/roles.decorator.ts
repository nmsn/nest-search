import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * 给 handler 标记"需要哪些角色才能访问"
 * 用法: @Roles('admin', 'editor')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);