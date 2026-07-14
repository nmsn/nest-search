import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import * as jwt from "jsonwebtoken";
import { JwtPayload } from "../libs/shared/interfaces/user.interface";
import { UserService } from "../user/user.service";
import { CasService } from "../cas/cas.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class AuthService {
  private readonly refreshTtl: number;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly userService: UserService,
    private readonly casService: CasService,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {
    this.refreshTtl = this.config.getOrThrow<number>(
      "REFRESH_TOKEN_EXPIRES_IN",
    );
    this.jwtSecret = this.config.getOrThrow<string>("JWT_SECRET");
    this.jwtExpiresIn = this.config.getOrThrow<string>("JWT_EXPIRES_IN");
  }

  async login(username: string, password: string) {
    const user = await this.userService.validatePassword(username, password);
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.status === "disabled")
      throw new ForbiddenException("User account is disabled");

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
    const isBlacklisted = await this.redisService.get(
      `refresh_token_blacklist:${refreshToken}`,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException("Refresh token has been revoked");
    }

    const tokenData = await this.redisService.get(
      `refresh_token:${refreshToken}`,
    );
    if (!tokenData) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const { userId } = JSON.parse(tokenData);
    const user = await this.userService.findById(userId);
    if (!user) throw new UnauthorizedException("User not found");
    if (user.status === "disabled")
      throw new ForbiddenException("User account is disabled");

    // Rotate: delete old refresh token, issue new pair
    await this.redisService.del(`refresh_token:${refreshToken}`);

    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string, accessToken?: string) {
    // 1. 现有逻辑:RT 黑名单
    const rtData = await this.redisService.get(`refresh_token:${refreshToken}`);
    if (rtData) {
      await this.redisService.set(
        `refresh_token_blacklist:${refreshToken}`,
        "1",
        this.refreshTtl,
      );
      await this.redisService.del(`refresh_token:${refreshToken}`);
    }

    // 2. 新增:AT 黑名单
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken) as unknown as JwtPayload;
        if (decoded?.jti && decoded?.exp) {
          const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
          if (remainingTtl > 0) {
            await this.redisService.set(
              `at_blacklist:${decoded.jti}`,
              "1",
              remainingTtl,
            );
          }
        }
      } catch {
        // AT 无效,忽略
      }
    }
  }

  private generateAccessToken(user: any): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const jti = randomUUID(); // ← 新加

    return jwt.sign({ ...payload, jti }, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    } as any);
  }

  /**
   * 公开的 AT 签发入口(0069 tRPC 用)
   * 跟 login() 的区别:不创建 refresh token,不写 Redis
   * gateway 收到 AT 后自己用 cookie / header 返回给客户端
   */
  async issueAccessToken(user: { id: number; username: string; role: string }): Promise<string> {
    return this.generateAccessToken(user);
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

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      const payload = jwt.verify(
        token,
        this.jwtSecret,
      ) as unknown as JwtPayload;

      // 检查 AT 黑名单
      if (payload.jti) {
        const blacklisted = await this.redisService.get(
          `at_blacklist:${payload.jti}`,
        );
        if (blacklisted) return null; // 已被吊销
      }

      return payload;
    } catch {
      return null;
    }
  }

  async getMe(userId: number) {
    return this.userService.findById(userId);
  }
}
