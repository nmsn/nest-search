
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AppController } from '../app.controller';

// 用真实的 RolesGuard + 真实的 AppController
const guard = new RolesGuard(new Reflector());

// 构造一个 mock ExecutionContext
function makeContext(userRolesHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: userRolesHeader ? { 'x-user-roles': userRolesHeader } : {},
      }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => AppController.prototype.syncFull,
    getClass: () => AppController,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http' as const,
    getRequest: undefined,
  } as any;
}

// 测试 1:有 admin 角色 → 通过
console.log('admin: ', guard.canActivate(makeContext('admin,user')));  // 期望: true

// 测试 2:有 guest 角色 → 拒绝
console.log('guest: ', guard.canActivate(makeContext('guest')));  // 期望: false

// 测试 3:无角色 header → 拒绝
console.log('no header: ', guard.canActivate(makeContext()));  // 期望: false

// 测试 4:listForms(没有 @Roles) → 通过
function makeContextForListForms(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => AppController.prototype.listForms,
    getClass: () => AppController,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http' as const,
    getRequest: undefined,
  } as any;
}
console.log('listForms no @Roles: ', guard.canActivate(makeContextForListForms()));  // 期望: true