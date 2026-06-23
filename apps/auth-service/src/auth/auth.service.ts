import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG } from '../libs/shared/constants/cas';
import { JwtPayload } from '../libs/shared/interfaces/user.interface';
import { UserService } from '../user/user.service';
import { CasService } from '../cas/cas.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  // CAS_CONFIG 来自常量(后续 lesson 转 @Injectable,TODO)
  // REFRESH_TOKEN_EXPIRES_IN 走 ConfigService
  private readonly refreshTtl: number;

  constructor(
    private readonly userService: UserService,
    private readonly casService: CasService,
    private readonly redisService: RedisService,
    config: ConfigService,
  ) {
    this.refreshTtl = config.getOrThrow<number>('REFRESH_TOKEN_EXPIRES_IN');
  }

  async login(username: string, password: string) {
    const user = await this.userService.validatePassword(username, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'disabled') throw new ForbiddenException('User account is disabled');

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  async validateTicket(ticket: string, service: string) {
    const user = await this.casService.validateSt(ticket, service);
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  async refresh(refreshToken: string) {
    // Check blacklist first
    const isBlacklisted = await this.redisService.get(`refresh_token_blacklist:${refreshToken}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const tokenData = await this.redisService.get(`refresh_token:${refreshToken}`);
    if (!tokenData) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { userId } = JSON.parse(tokenData);
    const user = await this.userService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.status === 'disabled') throw new ForbiddenException('User account is disabled');

    // Rotate: delete old refresh token, issue new pair
    await this.redisService.del(`refresh_token:${refreshToken}`);

    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    // Blacklist the refresh token(用 constructor 注入的 refreshTtl,不再读 process.env)
    await this.redisService.set(`refresh_token_blacklist:${refreshToken}`, '1', this.refreshTtl);

    // Remove token data
    await this.redisService.del(`refresh_token:${refreshToken}`);
  }

  private generateAccessToken(user: any): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return jwt.sign(payload, CAS_CONFIG.jwtSecret, {
      expiresIn: CAS_CONFIG.jwtExpiresIn,
    } as any);
  }

  private async createRefreshToken(userId: number): Promise<string> {
    const tokenId = randomUUID();

    // Store token -> userId mapping(用 constructor 注入的 refreshTtl)
    await this.redisService.set(
      `refresh_token:${tokenId}`,
      JSON.stringify({ userId }),
      this.refreshTtl,
    );

    return tokenId;
  }

  async validateToken(token: string) {
    try {
      return jwt.verify(token, CAS_CONFIG.jwtSecret) as unknown as { sub: number; username: string; role: string };
    } catch {
      return null;
    }
  }

  async getMe(userId: number) {
    return this.userService.findById(userId);
  }
}
