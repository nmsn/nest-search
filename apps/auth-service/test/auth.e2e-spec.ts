import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { RedisService } from "../src/redis/redis.service";
import { RedisMemoryService } from "../src/redis/redis-memory.service";
import { DrizzleService } from "../src/database/drizzle.service";
import { CasService } from "../src/cas/cas.service";
import { users } from "../src/database/schema/users";


describe("Auth Flow (e2e)", () => {
  let app: INestApplication;
  let redis: RedisMemoryService;
  let drizzle: DrizzleService;
  let casService: CasService;

  // 每个 e2e 跑用唯一 username — 避免本地/CI 重复跑冲突
  const username = `alice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = "pwd123456";
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // ← 核心:overrideProvider 替换 RedisService 为 in-memory 版本
      .overrideProvider(RedisService)
      .useClass(RedisMemoryService)
      .compile();

    app = moduleRef.createNestApplication();
    // main.ts 里也开了 ValidationPipe,e2e 同样开起来
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // override 之后,用原 token (RedisService) 拿到的就是替换后的实例
    redis = moduleRef.get(RedisService) as RedisMemoryService;
    drizzle = moduleRef.get(DrizzleService);
    casService = moduleRef.get(CasService);
  });

  afterAll(async () => {
    // 清理测试用户 — 用 drizzle 的 delete API,不是 raw SQL
    await drizzle.db.delete(users).where(eq(users.username, username));
    await app.close();
  });

  afterEach(() => {
    redis.clear(); // 每个 it 之间清空 in-memory store
  });

  // ───────────────────── happy path ─────────────────────

  it("POST /api/auth/register creates a new user (201)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ username, password, email: `${username}@test.com` })
      .expect(201);

    expect(res.body).toMatchObject({
      username,
      email: `${username}@test.com`,
      role: "user",
    });
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("POST /api/auth/login returns accessToken + sets refresh cookie (201)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ username, password })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toMatchObject({ username, role: "user" });

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    // supertest 把 set-cookie 当 string,但 Express 实际返 string[]
    const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
    expect(cookieArr.some((c: string) => /refreshToken=[^;]+/.test(c))).toBe(
      true,
    );
    expect(cookieArr.some((c: string) => /HttpOnly/i.test(c))).toBe(true);

    accessToken = res.body.accessToken;
  });

  it("GET /api/auth/me returns user when given valid Bearer token (200)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.user).toMatchObject({ username, role: "user" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  // ───────────────────── failure paths ─────────────────────

  it("GET /api/auth/me returns user=null with invalid token (200)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-real-token")
      .expect(200);

    expect(res.body.user).toBeNull();
  });

  it("POST /api/auth/register rejects duplicate username with 409", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ username, password })
      .expect(409);
  });

  it("POST /api/auth/login returns 401 on wrong password", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ username, password: "wrong-password" })
      .expect(401);
  });

  it("POST /api/auth/register returns 400 on password too short", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ username: "bob", password: "123" }) // @MinLength(6)
      .expect(400);
  });

  it("POST /api/auth/register 用 relations 查用户 + ticket 列表", async () => {
    // 用唯一 username,避免跟前面 register test 冲突(已创建该 user → 409)
    const uniqueUser = `relations_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. 注册
    const registerRes = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ username: uniqueUser, password })
      .expect(201);

    expect(registerRes.body).toMatchObject({ username: uniqueUser, role: "user" });

    // 2. 用 CasService 查用户 + tickets
    const userId = registerRes.body.id;
    const userWithTickets = await casService.findUserWithTickets(userId);

    expect(userWithTickets).toMatchObject({
      id: userId,
      username: uniqueUser,
    });
    expect(userWithTickets?.casTickets).toBeInstanceOf(Array);
    // ↑ 注册时没创建 ticket,应该是 []
  });
});
