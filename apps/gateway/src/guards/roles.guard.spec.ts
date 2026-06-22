import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  // mock ExecutionContext — 只给测试需要的字段
  function makeContext(userRolesHeader?: string): ExecutionContext {
    const headers: Record<string, string> = {};
    if (userRolesHeader) headers['x-user-roles'] = userRolesHeader;
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
        getResponse: () => ({}),
      }),
      getHandler: () => function testHandler() {},
      getClass: () => class TestClass {},
    } as any;
  }

  it('allows when no @Roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows when user has one of the required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'editor']);
    expect(guard.canActivate(makeContext('admin,user'))).toBe(true);
  });

  it('denies when user role does not match', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(makeContext('guest'))).toBe(false);
  });

  it('denies when no x-user-roles header', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(makeContext())).toBe(false);
  });
});