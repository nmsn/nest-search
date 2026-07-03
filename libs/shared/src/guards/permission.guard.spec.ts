import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { hasPermission, hasAllPermissions } from '../constants/permissions';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PermissionGuard, Reflector],
    }).compile();
    guard = module.get(PermissionGuard);
    reflector = module.get(Reflector);
  });

  function mockContext(user: any) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  it('无装饰器: 直接通过', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ role: 'guest' }))).toBe(true);
  });

  it('admin 通过任何权限', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['product:delete', 'user:manage']);
    expect(guard.canActivate(mockContext({ role: 'admin' }))).toBe(true);
  });

  it('user 有 product:read 通过', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['product:read']);
    expect(guard.canActivate(mockContext({ role: 'user' }))).toBe(true);
  });

  it('user 缺少 product:write 抛 403', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['product:write']);
    expect(() =>
      guard.canActivate(mockContext({ role: 'user' })),
    ).toThrow(ForbiddenException);
  });

  it('user 多个权限缺一个抛 403', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['product:read', 'product:write']);
    expect(() =>
      guard.canActivate(mockContext({ role: 'user' })),
    ).toThrow(/缺少 product:write/);
  });

  it('未认证抛 403', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['product:read']);
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});

describe('hasPermission helper', () => {
  it('admin 有 system:admin 权限', () => {
    expect(hasPermission('admin', 'product:read')).toBe(true);
    expect(hasPermission('admin', 'user:manage')).toBe(true);
  });

  it('user 只有 read 权限', () => {
    expect(hasPermission('user', 'product:read')).toBe(true);
    expect(hasPermission('user', 'product:write')).toBe(false);
    expect(hasPermission('user', 'product:delete')).toBe(false);
  });

  it('guest 只能 read', () => {
    expect(hasPermission('guest', 'product:read')).toBe(true);
    expect(hasPermission('guest', 'order:read')).toBe(false);
  });

  it('空 role 返回 false', () => {
    expect(hasPermission(undefined, 'product:read')).toBe(false);
  });
});

describe('hasAllPermissions helper', () => {
  it('user 有 read 但没 write → AND 失败', () => {
    expect(hasAllPermissions('user', ['product:read', 'product:write'])).toBe(
      false,
    );
  });

  it('admin 全部通过', () => {
    expect(
      hasAllPermissions('admin', ['product:write', 'user:manage']),
    ).toBe(true);
  });
});
