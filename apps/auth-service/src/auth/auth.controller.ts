import { Controller, Post, Get, Body, Headers, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from '../user/dto/login.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserService } from '../user/user.service';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG, JwtPayload } from '@app/shared';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  async register(@Body() dto: CreateUserDto) {
    const user = await this.userService.create(dto);
    const { passwordHash, ...result } = user as any;
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.username, dto.password);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('validate')
  async validate(@Body() body: { ticket: string; service: string }) {
    return this.authService.validateTicket(body.ticket, body.service);
  }

  @Post('refresh')
  async refresh(
    @Body() body: { refreshToken?: string },
    @Headers('cookie') cookie: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = body.refreshToken || this.extractRefreshTokenFromCookie(cookie);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    const result = await this.authService.refresh(refreshToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  async logout(
    @Body() body: { refreshToken?: string },
    @Headers('cookie') cookie: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = body.refreshToken || this.extractRefreshTokenFromCookie(cookie);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.clearRefreshTokenCookie(res);
    return { message: 'Logged out' };
  }

  @Get('me')
  async me(@Headers('authorization') auth: string) {
    if (!auth?.startsWith('Bearer ')) {
      return { user: null };
    }
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, CAS_CONFIG.jwtSecret) as unknown as JwtPayload;
      const user = await this.userService.findById(payload.sub);
      const { passwordHash, ...result } = user as any;
      return { user: result };
    } catch {
      return { user: null };
    }
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    const domain = process.env.CAS_COOKIE_DOMAIN || '.localhost';

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '604800') * 1000,
      domain,
      path: '/',
      secure: isProduction,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    const domain = process.env.CAS_COOKIE_DOMAIN || '.localhost';

    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'lax',
      domain,
      path: '/',
      secure: isProduction,
    });
  }

  private extractRefreshTokenFromCookie(cookie: string | undefined): string | undefined {
    if (!cookie) return undefined;
    const match = cookie.match(/refreshToken=([^;]+)/);
    return match ? match[1] : undefined;
  }
}
