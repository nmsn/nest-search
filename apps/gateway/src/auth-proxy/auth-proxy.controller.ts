import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoginDto } from '../common/dto/login.dto';
import { RegisterDto } from '../common/dto/register.dto';
import type { AuthTrpcClient } from '../trpc/auth.client';

/**
 * 0069 改造:从 ProxyService(字符串路径 + any body)切换到 tRPC client(端到端类型安全)
 *
 * 改动:
 *   - 注入 'AUTH_TRPC_CLIENT'(typed tRPC client)
 *   - 5 个方法体改成 tRPC mutate/query 调用
 *   - 仍然保留 REST 端点(对前端透明),内部从 HTTP/REST 变 tRPC
 *
 * headers 转发:
 *   - 每个调用通过 context.headers 传 authorization + x-request-id
 *   - 保留原有的 requestId + auth 头转发链路
 */
@ApiTags('Auth 代理')
@Controller('api/auth')
export class AuthProxyController {
  constructor(
    @Inject('AUTH_TRPC_CLIENT') private readonly authClient: AuthTrpcClient,
  ) {}

  private getHeaders(req: Request): Record<string, string> {
    return {
      ...(req.headers.authorization
        ? { authorization: req.headers.authorization as string }
        : {}),
      ...(req.id ? { 'x-request-id': req.id as string } : {}),
    };
  }

  @ApiOperation({ summary: '用户注册(代理到 auth-service,tRPC)' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    return this.authClient.auth.register.mutate(body, {
      context: { headers: this.getHeaders(req) },
    });
  }

  @ApiOperation({ summary: '用户登录(代理到 auth-service,tRPC)' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '凭证错' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request) {
    return this.authClient.auth.login.mutate(body, {
      context: { headers: this.getHeaders(req) },
    });
  }

  @ApiOperation({ summary: '校验 token(代理到 auth-service,tRPC)' })
  @ApiResponse({ status: 200, description: 'token 有效' })
  @ApiResponse({ status: 401, description: 'token 无效或过期' })
  @Post('validate')
  async validate(
    @Body() body: { ticket: string; service: string },
    @Req() req: Request,
  ) {
    return this.authClient.auth.validate.mutate(body, {
      context: { headers: this.getHeaders(req) },
    });
  }

  @ApiOperation({ summary: '登出(代理到 auth-service,tRPC)' })
  @ApiResponse({ status: 200, description: '登出成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @Post('logout')
  async logout(@Req() req: Request) {
    // logout 从 cookie/header 拿 refresh token,转给 tRPC
    const refreshToken = this.extractRefreshTokenFromCookie(
      req.headers.cookie as string | undefined,
    );
    const accessToken = (req.headers.authorization as string)?.replace(
      'Bearer ',
      '',
    );

    return this.authClient.auth.logout.mutate(
      { refreshToken, accessToken } as any,
      { context: { headers: this.getHeaders(req) } },
    );
  }

  @ApiOperation({
    summary: '获取当前用户信息(代理到 auth-service,tRPC,需要 Bearer token)',
  })
  @ApiResponse({ status: 200, description: '返回当前用户' })
  @ApiResponse({ status: 401, description: '未提供或无效 token' })
  @Get('me')
  async me(@Req() req: Request) {
    return this.authClient.auth.me.query(undefined, {
      context: { headers: this.getHeaders(req) },
    });
  }

  private extractRefreshTokenFromCookie(
    cookie: string | undefined,
  ): string | undefined {
    if (!cookie) return undefined;
    const match = cookie.match(/refreshToken=([^;]+)/);
    return match ? match[1] : undefined;
  }
}
