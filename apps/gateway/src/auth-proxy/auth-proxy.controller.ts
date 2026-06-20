import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoginDto } from '../common/dto/login.dto';
import { RegisterDto } from '../common/dto/register.dto';
import { ProxyService } from '../proxy/proxy.service';

@ApiTags('Auth 代理')
@Controller('api/auth')
export class AuthProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @ApiOperation({ summary: '用户注册(代理到 auth-service)' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.proxyService.forward('auth', 'POST', '/api/auth/register', body);
  }

  @ApiOperation({ summary: '用户登录(代理到 auth-service)' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '凭证错' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.proxyService.forward('auth', 'POST', '/api/auth/login', body);
  }

  @ApiOperation({ summary: '校验 token(代理到 auth-service)' })
  @ApiResponse({ status: 200, description: 'token 有效' })
  @ApiResponse({ status: 401, description: 'token 无效或过期' })
  @Post('validate')
  async validate(@Body() body: any) {
    return this.proxyService.forward('auth', 'POST', '/api/auth/validate', body);
  }

  @ApiOperation({ summary: '登出(代理到 auth-service)' })
  @ApiResponse({ status: 200, description: '登出成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @Post('logout')
  async logout() {
    return this.proxyService.forward('auth', 'POST', '/api/auth/logout');
  }

  @ApiOperation({
    summary: '获取当前用户信息(代理到 auth-service,需要 Bearer token)',
  })
  @ApiResponse({ status: 200, description: '返回当前用户' })
  @ApiResponse({ status: 401, description: '未提供或无效 token' })
  @Get('me')
  async me(@Req() req: Request) {
    return this.proxyService.forward('auth', 'GET', '/api/auth/me', undefined, {
      authorization: req.headers.authorization || '',
    });
  }
}