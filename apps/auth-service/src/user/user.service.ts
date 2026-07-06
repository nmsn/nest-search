import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import {
  UserNotFoundException,
  UsernameConflictException,
} from "../exceptions/user.exceptions";
import { users } from "../database/schema/users";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcrypt";
// 方案 B:DTO 单一 source of truth 在 database/dto/
import { RegisterApi as CreateUserDto } from "../database/dto/users.dto";
import { CacheService } from "../cache/cache.service";

@Injectable()
export class UserService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new UsernameConflictException(dto.username);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [inserted] = await this.drizzle.db
      .insert(users)
      .values({
        username: dto.username,
        passwordHash,
        email: dto.email,
        role: dto.role || "user",
      })
      .returning({ id: users.id });
    return this.findById(inserted.id);
  }

  /**
   * 查用户 — 通用 Cache-Aside 封装
   *
   * 之前手写 20 行(查 cache → miss → 查 DB → 写 cache → 防穿透)
   * 现在 7 行,3 大坑由 CacheService 自动处理
   */
  async findById(id: number) {
    const user = await this.cache.getOrSet(
      `user:${id}`,
      async () => {
        const [result] = await this.drizzle.db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        return result || null;
      },
      {
        ttl: 300, // 正常数据 5 分钟
        nullTtl: 60, // 空值 1 分钟(防穿透)
        enableLock: true, // 用户信息是热点,开击穿防护
      },
    );

    if (!user) throw new UserNotFoundException(id);
    return user;
  }

  async findByUsername(username: string) {
    const [result] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return result || null;
  }

  async validatePassword(username: string, password: string) {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (user.status === "disabled") return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user;
  }
}
