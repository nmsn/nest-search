import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import { AppModule } from "../src/app.module";
import { RedisService } from "../src/redis/redis.service";
import { RedisMemoryService } from "../src/redis/redis-memory.service";
import { DrizzleService } from "../src/database/drizzle.service";
import { CasService } from "../src/cas/cas.service";
import { users } from "../src/database/schema/users";

describe("CAS Service (e2e)", () => {
  let app: INestApplication;
  let redis: RedisMemoryService;
  let drizzle: DrizzleService;
  let casService: CasService;

  // 用唯一 username 避免并发/重复跑冲突
  const testUser = `casuser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const testPassword = "pwd123456";

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // RedisService 用 in-memory 替身(0014 lesson §4.1 模式)
      .overrideProvider(RedisService)
      .useClass(RedisMemoryService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    redis = moduleRef.get(RedisService) as RedisMemoryService;
    drizzle = moduleRef.get(DrizzleService);
    casService = moduleRef.get(CasService);
  });

  afterAll(async () => {
    // 清理测试用户(§3.6 失败回滚测试应该没数据,保险起见)
    await drizzle.db.delete(users).where(eq(users.username, testUser));
    await app.close();
  });

  // ─── §3.4 Relations API ───
  it("findUserWithTickets 返回嵌套结构(无 ticket 时 casTickets = [])", async () => {
    // 准备:直接插一个 user(不走 register,因为本测试只关心 casService)
    await drizzle.db.insert(users).values({
      username: testUser,
      passwordHash: await bcrypt.hash(testPassword, 10),
    });

    const [u] = await drizzle.db
      .select()
      .from(users)
      .where(eq(users.username, testUser))
      .limit(1);

    // 调用 Relations API 查询
    const result = await casService.findUserWithTickets(u.id);

    expect(result).not.toBeNull();
    expect(result?.username).toBe(testUser);
    expect(result?.casTickets).toEqual([]);
  });

  // ─── §3.6 事务回滚反向验证 ───
  it("createUserWithTicket 事务回滚: ticket 失败时 user 也不入库", async () => {
    const failUser = `${testUser}_fail`;

    // 故意用超长 ticket 触发 varchar(255) 错误
    await expect(
      casService.createUserWithTicket({
        username: failUser,
        password: testPassword,
        ticket: "x".repeat(1000),
      }),
    ).rejects.toThrow();

    // 关键断言:user 必须没入库(被事务回滚)
    const exists = await drizzle.db
      .select()
      .from(users)
      .where(eq(users.username, failUser));

    expect(exists).toEqual([]);
  });
});