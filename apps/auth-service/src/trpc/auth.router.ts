import { Injectable } from '@nestjs/common';
import { Ctx, Input, Mutation, Query, Router } from 'nestjs-trpc';
import {
  authSchemas,
  AuthErrors,
  type TrpcContext,
  type RegisterInput,
  type LoginInput,
  type ValidateInput,
} from '../../../../libs/shared/src/contracts';
import { UserService } from '../user/user.service';
import { AuthService } from '../auth/auth.service';

/**
 * Auth tRPC Router
 *
 * 5 个 procedure(对应 libs/shared/src/contracts/auth.contract.ts 的 contract):
 *   - register: POST /trpc/auth.register
 *   - login:    POST /trpc/auth.login
 *   - validate: POST /trpc/auth.validate
 *   - logout:   POST /trpc/auth.logout
 *   - me:       GET  /trpc/auth.me
 *
 * 每个 procedure 委托给现有 NestJS service 方法(AuthService / UserService)
 * → 业务代码 0 改动,加 tRPC 薄壳层
 */
@Injectable()
@Router({ alias: 'auth' })  // → 路径前缀 /trpc/auth.*
export class AuthRouter {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  // ─── register ─────────────────────────────────────────────

  @Mutation({
    input: authSchemas.RegisterInput,
    output: authSchemas.UserOutput,
  })
  async register(@Input() input: RegisterInput) {
    try {
      const user = await this.userService.create(input);
      return user;
    } catch (e: any) {
      // userService.create 抛 UsernameConflictException
      if (e?.message?.includes('已存在') || e?.name === 'UsernameConflictException') {
        throw AuthErrors.UsernameConflict();
      }
      throw e;
    }
  }

  // ─── login ────────────────────────────────────────────────

  @Mutation({
    input: authSchemas.LoginInput,
    output: authSchemas.LoginOutput,
  })
  async login(@Input() input: LoginInput) {
    const user = await this.userService.validatePassword(
      input.username,
      input.password,
    );
    if (!user) throw AuthErrors.InvalidCredentials();

    // 生成 access token
    const accessToken = await this.authService.issueAccessToken({
      id: user.id,
      username: user.username,
      role: user.role ?? 'user',
    });

    // 注意:drizzle schema 的 role/status 都是 nullable
    // 但 DB default 都是 'user' / 'active',正常情况不会是 null
    // 这里用 ?? 兜底,保证 contract schema(z.string())通过
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        role: user.role ?? 'user',
        status: user.status ?? 'active',
      },
    };
  }

  // ─── validate(CAS ticket 校验) ──────────────────────────

  @Mutation({
    input: authSchemas.ValidateInput,
  })
  async validate(@Input() input: ValidateInput) {
    const result = await this.authService.validateTicket(
      input.ticket,
      input.service,
    );
    return result;  // { valid: boolean, user?: ... }
  }

  // ─── logout ───────────────────────────────────────────────

  @Mutation({
    output: authSchemas.LogoutOutput,
  })
  async logout(
    @Ctx() ctx: TrpcContext,
    // logout 从 ctx 拿 refreshToken(由 gateway 从 cookie 解析)
    @Input() input: { refreshToken?: string; accessToken?: string },
  ) {
    if (input?.refreshToken) {
      await this.authService.logout(input.refreshToken, input.accessToken);
    }
    return { message: 'Logged out' };
  }

  // ─── me ───────────────────────────────────────────────────

  @Query({
    input: undefined,  // me 不需要 input(authorization 从 ctx 拿)
    output: authSchemas.MeOutput,
  })
  async me(@Ctx() ctx: TrpcContext) {
    if (!ctx.user) {
      return { user: null };
    }
    const user = await this.userService.findById(ctx.user.sub);
    if (!user) return { user: null };
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        role: user.role,
        status: user.status,
      },
    };
  }
}
