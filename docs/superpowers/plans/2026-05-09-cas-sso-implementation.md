# CAS SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement CAS SSO with a new auth-service, allowing multiple frontends to share login sessions.

**Architecture:** New `auth-service` as CAS Server with TGT/ST ticket flow. Gateway adds CasGuard for JWT verification alongside existing ApiKeyGuard.

**Tech Stack:** NestJS, MySQL, Drizzle ORM, bcrypt, jsonwebtoken, cookie-parser

**Spec:** `docs/superpowers/specs/2026-05-09-cas-sso-design.md`

---

## File Structure

```
nest-search/
├── apps/
│   ├── auth-service/
│   │   ├── tsconfig.app.json
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── database/
│   │   │   │   ├── drizzle.module.ts
│   │   │   │   ├── drizzle.service.ts
│   │   │   │   └── schema/
│   │   │   │       ├── users.ts
│   │   │   │       ├── cas-tickets.ts
│   │   │   │       └── cas-services.ts
│   │   │   ├── user/
│   │   │   │   ├── user.module.ts
│   │   │   │   ├── user.service.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-user.dto.ts
│   │   │   │       └── login.dto.ts
│   │   │   ├── cas/
│   │   │   │   ├── cas.module.ts
│   │   │   │   ├── cas.controller.ts
│   │   │   │   └── cas.service.ts
│   │   │   └── auth/
│   │   │       ├── auth.module.ts
│   │   │       ├── auth.controller.ts
│   │   │       └── auth.service.ts
│   └── gateway/src/
│       ├── guards/
│       │   ├── api-key.guard.ts (existing)
│       │   └── cas.guard.ts (NEW)
│       ├── app.module.ts (modify)
│       └── app.controller.ts (modify)
├── libs/shared/src/
│   ├── constants/
│   │   └── cas.ts (NEW)
│   └── interfaces/
│       └── user.interface.ts (NEW)
├── .env (modify)
├── nest-cli.json (modify)
└── package.json (modify)
```

---

## Task 1: Auth Service Scaffolding

**Files:**
- Create: `apps/auth-service/tsconfig.app.json`
- Modify: `nest-cli.json`
- Modify: `.env`
- Modify: `package.json`

- [ ] **Step 1: Create auth-service tsconfig**

```json
// apps/auth-service/tsconfig.app.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/auth-service",
    "rootDir": "../.."
  },
  "include": ["src/**/*", "../../libs/shared/src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 2: Add auth-service to nest-cli.json**

Add to the `projects` object in `nest-cli.json`:

```json
"auth-service": {
  "type": "application",
  "root": "apps/auth-service",
  "entryFile": "main",
  "sourceRoot": "apps/auth-service/src",
  "compilerOptions": {
    "tsConfigPath": "apps/auth-service/tsconfig.app.json"
  }
}
```

- [ ] **Step 3: Add env vars to .env**

Append to `.env`:

```env
# Auth Service
AUTH_SERVICE_PORT=3004
JWT_SECRET=nest-search-jwt-secret-change-in-production
JWT_EXPIRES_IN=2h
CAS_TGT_EXPIRES_IN=8h
CAS_ST_EXPIRES_IN=30s
CAS_COOKIE_DOMAIN=.example.local
```

- [ ] **Step 4: Install dependencies**

```bash
npm install bcrypt jsonwebtoken cookie-parser
npm install -D @types/bcrypt @types/jsonwebtoken @types/cookie-parser
```

- [ ] **Step 5: Add start script to package.json**

Add to `scripts` in `package.json`:

```json
"start:auth": "nest start auth-service"
```

- [ ] **Step 6: Commit**

```bash
git add apps/auth-service/tsconfig.app.json nest-cli.json .env package.json package-lock.json
git commit -m "chore: scaffold auth-service with dependencies"
```

---

## Task 2: Shared Library - CAS Constants & User Interface

**Files:**
- Create: `libs/shared/src/constants/cas.ts`
- Create: `libs/shared/src/interfaces/user.interface.ts`
- Modify: `libs/shared/src/index.ts`

- [ ] **Step 1: Create CAS constants**

```typescript
// libs/shared/src/constants/cas.ts
export const CAS_CONFIG = {
  cookieName: 'TGC',
  cookieDomain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
  tgtExpiresIn: process.env.CAS_TGT_EXPIRES_IN || '8h',
  stExpiresIn: process.env.CAS_ST_EXPIRES_IN || '30s',
  jwtSecret: process.env.JWT_SECRET || 'nest-search-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
};
```

- [ ] **Step 2: Create user interface**

```typescript
// libs/shared/src/interfaces/user.interface.ts
export interface JwtPayload {
  sub: number;
  username: string;
  role: 'admin' | 'user';
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  userId: number;
  username: string;
  role: 'admin' | 'user';
}
```

- [ ] **Step 3: Update shared index**

Add to `libs/shared/src/index.ts`:

```typescript
export * from './constants/cas';
export * from './interfaces/user.interface';
```

- [ ] **Step 4: Commit**

```bash
git add libs/shared/
git commit -m "feat: add CAS constants and user interface to shared library"
```

---

## Task 3: Auth Service - Database Layer

**Files:**
- Create: `apps/auth-service/src/database/schema/users.ts`
- Create: `apps/auth-service/src/database/schema/cas-tickets.ts`
- Create: `apps/auth-service/src/database/schema/cas-services.ts`
- Create: `apps/auth-service/src/database/drizzle.service.ts`
- Create: `apps/auth-service/src/database/drizzle.module.ts`

- [ ] **Step 1: Create users schema**

```typescript
// apps/auth-service/src/database/schema/users.ts
import { mysqlTable, int, varchar, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  email: varchar('email', { length: 100 }),
  role: mysqlEnum('role', ['admin', 'user']).default('user'),
  status: mysqlEnum('status', ['active', 'disabled']).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
```

- [ ] **Step 2: Create cas_tickets schema**

```typescript
// apps/auth-service/src/database/schema/cas-tickets.ts
import { mysqlTable, int, varchar, timestamp, mysqlEnum, boolean } from 'drizzle-orm/mysql-core';
import { users } from './users';

export const casTickets = mysqlTable('cas_tickets', {
  id: int('id').primaryKey().autoincrement(),
  ticket: varchar('ticket', { length: 255 }).unique().notNull(),
  type: mysqlEnum('type', ['TGT', 'ST']).notNull(),
  userId: int('user_id').notNull().references(() => users.id),
  service: varchar('service', { length: 500 }),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
```

- [ ] **Step 3: Create cas_services schema**

```typescript
// apps/auth-service/src/database/schema/cas-services.ts
import { mysqlTable, int, varchar, timestamp, boolean } from 'drizzle-orm/mysql-core';

export const casServices = mysqlTable('cas_services', {
  id: int('id').primaryKey().autoincrement(),
  serviceId: varchar('service_id', { length: 100 }).unique().notNull(),
  serviceUrl: varchar('service_url', { length: 500 }).notNull(),
  name: varchar('name', { length: 100 }),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});
```

- [ ] **Step 4: Create Drizzle service**

```typescript
// apps/auth-service/src/database/drizzle.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2';
import { users } from './schema/users';
import { casTickets } from './schema/cas-tickets';
import { casServices } from './schema/cas-services';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  async onModuleInit() {
    const pool = createPool({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });

    this.db = drizzle(pool, {
      schema: { users, casTickets, casServices },
      mode: 'default',
    });

    await this.seedServices();
  }

  private async seedServices() {
    const services = [
      { serviceId: 'ds-frontend', serviceUrl: 'http://ds.example.local/callback', name: '商显前端' },
      { serviceId: 'zk-frontend', serviceUrl: 'http://zk.example.local/callback', name: '道闸前端' },
      { serviceId: 'meeting-frontend', serviceUrl: 'http://meeting.example.local/callback', name: '会议平板前端' },
    ];

    for (const svc of services) {
      await this.db.insert(casServices)
        .values(svc)
        .onDuplicateKeyUpdate({ set: { name: svc.name } });
    }
  }
}
```

- [ ] **Step 5: Create Drizzle module**

```typescript
// apps/auth-service/src/database/drizzle.module.ts
import { Global, Module } from '@nestjs/common';
import { DrizzleService } from './drizzle.service';

@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/auth-service/src/database/
git commit -m "feat: add auth-service database layer with users, cas_tickets, cas_services schemas"
```

---

## Task 4: Auth Service - User Module

**Files:**
- Create: `apps/auth-service/src/user/dto/create-user.dto.ts`
- Create: `apps/auth-service/src/user/dto/login.dto.ts`
- Create: `apps/auth-service/src/user/user.service.ts`
- Create: `apps/auth-service/src/user/user.module.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// apps/auth-service/src/user/dto/create-user.dto.ts
import { IsString, IsOptional, IsEmail, IsEnum, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['admin', 'user'])
  role?: 'admin' | 'user';
}
```

```typescript
// apps/auth-service/src/user/dto/login.dto.ts
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

- [ ] **Step 2: Create User service**

```typescript
// apps/auth-service/src/user/user.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { users } from '../database/schema/users';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const insertResult = await this.drizzle.db.insert(users).values({
      username: dto.username,
      passwordHash,
      email: dto.email,
      role: dto.role || 'user',
    });
    const insertedId = insertResult[0].insertId;
    return this.findById(Number(insertedId));
  }

  async findById(id: number) {
    const [result] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!result) throw new NotFoundException(`User #${id} not found`);
    return result;
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
    if (user.status === 'disabled') return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user;
  }
}
```

- [ ] **Step 3: Create User module**

```typescript
// apps/auth-service/src/user/user.module.ts
import { Module } from '@nestjs/common';
import { UserService } from './user.service';

@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/auth-service/src/user/
git commit -m "feat: add User module with bcrypt password hashing"
```

---

## Task 5: Auth Service - CAS Module

**Files:**
- Create: `apps/auth-service/src/cas/cas.service.ts`
- Create: `apps/auth-service/src/cas/cas.controller.ts`
- Create: `apps/auth-service/src/cas/cas.module.ts`

- [ ] **Step 1: Create CAS service**

```typescript
// apps/auth-service/src/cas/cas.service.ts
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { casTickets } from '../database/schema/cas-tickets';
import { casServices } from '../database/schema/cas-services';
import { users } from '../database/schema/users';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';

@Injectable()
export class CasService {
  constructor(private readonly drizzle: DrizzleService) {}

  async issueTgt(userId: number): Promise<string> {
    const ticket = `TGT-${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await this.drizzle.db.insert(casTickets).values({
      ticket,
      type: 'TGT',
      userId,
      expiresAt,
    });

    return ticket;
  }

  async issueSt(tgtTicket: string, serviceUrl: string): Promise<string> {
    // Validate TGT
    const tgt = await this.validateTgt(tgtTicket);
    if (!tgt) throw new UnauthorizedException('Invalid or expired TGT');

    // Validate service is registered
    const [service] = await this.drizzle.db
      .select()
      .from(casServices)
      .where(and(
        eq(casServices.serviceUrl, serviceUrl),
        eq(casServices.enabled, true),
      ))
      .limit(1);

    if (!service) throw new BadRequestException('Service not registered');

    // Issue ST
    const ticket = `ST-${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 1000); // 30 seconds

    await this.drizzle.db.insert(casTickets).values({
      ticket,
      type: 'ST',
      userId: tgt.userId,
      service: serviceUrl,
      expiresAt,
    });

    return ticket;
  }

  async validateSt(ticket: string, serviceUrl: string) {
    const [st] = await this.drizzle.db
      .select()
      .from(casTickets)
      .where(and(
        eq(casTickets.ticket, ticket),
        eq(casTickets.type, 'ST'),
        eq(casTickets.consumed, false),
        gt(casTickets.expiresAt, new Date()),
      ))
      .limit(1);

    if (!st) throw new UnauthorizedException('Invalid or expired service ticket');
    if (st.service !== serviceUrl) throw new UnauthorizedException('Service URL mismatch');

    // Mark as consumed
    await this.drizzle.db
      .update(casTickets)
      .set({ consumed: true })
      .where(eq(casTickets.id, st.id));

    // Get user
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, st.userId))
      .limit(1);

    if (!user) throw new UnauthorizedException('User not found');
    if (user.status === 'disabled') throw new UnauthorizedException('User account is disabled');

    return user;
  }

  async validateTgt(ticket: string) {
    const [tgt] = await this.drizzle.db
      .select()
      .from(casTickets)
      .where(and(
        eq(casTickets.ticket, ticket),
        eq(casTickets.type, 'TGT'),
        gt(casTickets.expiresAt, new Date()),
      ))
      .limit(1);

    return tgt || null;
  }

  async destroyTgt(ticket: string) {
    await this.drizzle.db
      .delete(casTickets)
      .where(and(
        eq(casTickets.ticket, ticket),
        eq(casTickets.type, 'TGT'),
      ));
  }
}
```

- [ ] **Step 2: Create CAS controller**

```typescript
// apps/auth-service/src/cas/cas.controller.ts
import { Controller, Get, Post, Body, Query, Res, Req, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { CasService } from './cas.service';
import { UserService } from '../user/user.service';
import { LoginDto } from '../user/dto/login.dto';

@Controller('cas')
export class CasController {
  constructor(
    private readonly casService: CasService,
    private readonly userService: UserService,
  ) {}

  @Get('login')
  async loginPage(
    @Query('service') service: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Check if TGC cookie exists (user already logged in)
    const tgc = req.cookies?.TGC;
    if (tgc) {
      const tgt = await this.casService.validateTgt(tgc);
      if (tgt) {
        // Auto-issue ST and redirect
        try {
          const st = await this.casService.issueSt(tgc, service);
          return res.redirect(`${service}?ST=${st}`);
        } catch {
          // TGT valid but service issue — show login page
        }
      }
    }

    // Return login page (simple HTML form)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>CAS Login</title></head>
      <body>
        <h2>CAS 单点登录</h2>
        <form method="POST" action="/cas/login">
          <input type="hidden" name="service" value="${service}" />
          <div><label>用户名: <input type="text" name="username" required /></label></div>
          <div><label>密&nbsp;&nbsp;码: <input type="password" name="password" required /></label></div>
          <div><button type="submit">登录</button></div>
        </form>
      </body>
      </html>
    `);
  }

  @Post('login')
  async handleLogin(
    @Body() body: { username: string; password: string; service: string },
    @Res() res: Response,
  ) {
    const user = await this.userService.validatePassword(body.username, body.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Issue TGT
    const tgt = await this.casService.issueTgt(user.id);

    // Set TGC cookie
    res.cookie('TGC', tgt, {
      httpOnly: true,
      domain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    // Issue ST and redirect
    const st = await this.casService.issueSt(tgt, body.service);
    res.redirect(`${body.service}?ST=${st}`);
  }

  @Get('validate')
  async validateV1(@Query('ticket') ticket: string, @Query('service') service: string) {
    const user = await this.casService.validateSt(ticket, service);
    return { valid: true, username: user.username };
  }

  @Post('serviceValidate')
  async validateV2(@Body() body: { ticket: string; service: string }) {
    const user = await this.casService.validateSt(body.ticket, body.service);
    // CAS 2.0/3.0 returns XML, but we'll return JSON for simplicity
    return {
      serviceResponse: {
        authenticationSuccess: {
          user: user.username,
          attributes: { id: user.id, role: user.role },
        },
      },
    };
  }

  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const tgc = req.cookies?.TGC;
    if (tgc) {
      await this.casService.destroyTgt(tgc);
    }
    res.clearCookie('TGC', {
      domain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
    });
    res.send('已退出登录');
  }
}
```

- [ ] **Step 3: Create CAS module**

```typescript
// apps/auth-service/src/cas/cas.module.ts
import { Module } from '@nestjs/common';
import { CasController } from './cas.controller';
import { CasService } from './cas.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [CasController],
  providers: [CasService],
  exports: [CasService],
})
export class CasModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/auth-service/src/cas/
git commit -m "feat: add CAS protocol module with TGT/ST ticket flow"
```

---

## Task 6: Auth Service - Auth Module

**Files:**
- Create: `apps/auth-service/src/auth/auth.service.ts`
- Create: `apps/auth-service/src/auth/auth.controller.ts`
- Create: `apps/auth-service/src/auth/auth.module.ts`

- [ ] **Step 1: Create Auth service**

```typescript
// apps/auth-service/src/auth/auth.service.ts
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG, JwtPayload } from '@app/shared';
import { UserService } from '../user/user.service';
import { CasService } from '../cas/cas.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly casService: CasService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.userService.validatePassword(username, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'disabled') throw new ForbiddenException('User account is disabled');

    return this.generateToken(user);
  }

  async validateTicket(ticket: string, service: string) {
    const user = await this.casService.validateSt(ticket, service);
    return this.generateToken(user);
  }

  private generateToken(user: any) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(payload, CAS_CONFIG.jwtSecret, {
      expiresIn: CAS_CONFIG.jwtExpiresIn,
    });

    return {
      token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }
}
```

- [ ] **Step 2: Create Auth controller**

```typescript
// apps/auth-service/src/auth/auth.controller.ts
import { Controller, Post, Get, Body, Headers } from '@nestjs/common';
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
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Post('validate')
  async validate(@Body() body: { ticket: string; service: string }) {
    return this.authService.validateTicket(body.ticket, body.service);
  }

  @Post('logout')
  async logout() {
    // JWT is stateless — client discards token. No server-side session to destroy.
    return { message: 'Logged out' };
  }

  @Get('me')
  async me(@Headers('authorization') auth: string) {
    if (!auth?.startsWith('Bearer ')) {
      return { user: null };
    }
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, CAS_CONFIG.jwtSecret) as JwtPayload;
      const user = await this.userService.findById(payload.sub);
      const { passwordHash, ...result } = user as any;
      return { user: result };
    } catch {
      return { user: null };
    }
  }
}
```

- [ ] **Step 3: Create Auth module**

```typescript
// apps/auth-service/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { CasModule } from '../cas/cas.module';

@Module({
  imports: [UserModule, CasModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/auth-service/src/auth/
git commit -m "feat: add Auth module with JWT token generation"
```

---

## Task 7: Auth Service - App Module & Main

**Files:**
- Create: `apps/auth-service/src/app.module.ts`
- Create: `apps/auth-service/src/main.ts`

- [ ] **Step 1: Create app module**

```typescript
// apps/auth-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './database/drizzle.module';
import { UserModule } from './user/user.module';
import { CasModule } from './cas/cas.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    UserModule,
    CasModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Create main.ts**

```typescript
// apps/auth-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = process.env.AUTH_SERVICE_PORT || 3004;
  await app.listen(port);
  console.log(`Auth Service running on port ${port}`);
}
bootstrap();
```

- [ ] **Step 3: Test build**

```bash
npx nest build auth-service
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/auth-service/src/app.module.ts apps/auth-service/src/main.ts
git commit -m "feat: add Auth Service app module and entry point"
```

---

## Task 8: Gateway - CasGuard

**Files:**
- Create: `apps/gateway/src/guards/cas.guard.ts`
- Modify: `apps/gateway/src/app.module.ts`
- Modify: `apps/gateway/src/app.controller.ts`
- Modify: `apps/gateway/src/proxy/proxy.service.ts`

- [ ] **Step 1: Create CasGuard**

```typescript
// apps/gateway/src/guards/cas.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG, JwtPayload, AuthUser } from '@app/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

@Injectable()
export class CasGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      return true; // Let ApiKeyGuard handle if no Bearer token
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, CAS_CONFIG.jwtSecret) as JwtPayload;
      request.user = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
```

- [ ] **Step 2: Update Gateway app.module.ts**

Modify `apps/gateway/src/app.module.ts` to add CasGuard before ApiKeyGuard:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { CasGuard } from './guards/cas.guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { ProxyService } from './proxy/proxy.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [
    ProxyService,
    {
      provide: APP_GUARD,
      useClass: CasGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Update ApiKeyGuard to skip when user is authenticated**

Modify `apps/gateway/src/guards/api-key.guard.ts` to allow requests that already have a user (from CasGuard):

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { isValidBusinessLine } from '@app/shared';

const API_KEYS: Record<string, string> = {
  ds: process.env.API_KEY_DS || 'ds_key_123',
  zk: process.env.API_KEY_ZK || 'zk_key_456',
  meeting: process.env.API_KEY_MEETING || 'meeting_key_789',
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // If user is already authenticated via CasGuard, skip API key check
    if (request.user) {
      return true;
    }

    const apiKey = request.headers['x-api-key'];
    const businessLine = request.params.businessLine;

    // If no API key and no user, reject
    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key or Authorization header');
    }

    if (!businessLine || !isValidBusinessLine(businessLine)) {
      return true;
    }

    const expectedKey = API_KEYS[businessLine];
    if (apiKey !== expectedKey) {
      throw new UnauthorizedException(`Invalid API key for business line: ${businessLine}`);
    }

    return true;
  }
}
```

- [ ] **Step 4: Add auth routes to Gateway controller**

Add to `apps/gateway/src/app.controller.ts`:

```typescript
  // Auth Service routes
  @Post('api/auth/register')
  async register(@Body() body: any) {
    return this.proxyService.forward('auth', 'POST', '/api/auth/register', body);
  }

  @Post('api/auth/login')
  async login(@Body() body: any) {
    return this.proxyService.forward('auth', 'POST', '/api/auth/login', body);
  }

  @Post('api/auth/validate')
  async validate(@Body() body: any) {
    return this.proxyService.forward('auth', 'POST', '/api/auth/validate', body);
  }

  @Post('api/auth/logout')
  async logout() {
    return this.proxyService.forward('auth', 'POST', '/api/auth/logout');
  }

  @Get('api/auth/me')
  async me(@Req() req: Request) {
    return this.proxyService.forward('auth', 'GET', '/api/auth/me', undefined, {
      authorization: req.headers.authorization || '',
    });
  }
```

Also add `auth` to the ProxyService `SERVICE_MAP` in `apps/gateway/src/proxy/proxy.service.ts`:

```typescript
const SERVICE_MAP: Record<string, string> = {
  sync: process.env.SYNC_SERVICE_URL || 'http://localhost:3001',
  search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3002',
  form: process.env.FORM_SERVICE_URL || 'http://localhost:3003',
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3004',
};
```

Then apply `AdminGuard` to sync routes in `apps/gateway/src/app.controller.ts`. Add the import and `@UseGuards(AdminGuard)` decorator to all sync route handlers:

```typescript
import { UseGuards } from '@nestjs/common';
import { AdminGuard } from './guards/cas.guard';

// ... in the controller class, add @UseGuards(AdminGuard) to each sync route:
@UseGuards(AdminGuard)
@Post('api/sync/full/:businessLine')
async fullSync(@Param('businessLine') businessLine: string) { ... }

@UseGuards(AdminGuard)
@Post('api/sync/incremental/:businessLine')
async incrementalSync(@Param('businessLine') businessLine: string) { ... }
```

- [ ] **Step 5: Test build**

```bash
npx nest build gateway
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/gateway/
git commit -m "feat: add CasGuard to Gateway with JWT verification"
```

---

## Task 9: Integration Testing

**Files:** None (verification only)

- [ ] **Step 1: Start infrastructure**

```bash
docker-compose up -d
```

- [ ] **Step 2: Start all services**

```bash
# Terminal 1
npm run start:auth

# Terminal 2
npm run start:form

# Terminal 3
npm run start:search

# Terminal 4
npm run start:sync

# Terminal 5
npm run start:gateway
```

- [ ] **Step 3: Register a user**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","role":"admin"}'
```

Expected: `{ "id": 1, "username": "admin", "role": "admin", "status": "active" }`

- [ ] **Step 4: Direct login (bypass CAS)**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Expected: `{ "token": "eyJ...", "user": { "id": 1, "username": "admin", "role": "admin" } }`

- [ ] **Step 5: Access protected endpoint with JWT**

```bash
TOKEN="<paste token from step 4>"
curl "http://localhost:3000/api/search/ds/products" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: Search results (200 OK).

- [ ] **Step 6: Access protected endpoint without auth**

```bash
curl http://localhost:3000/api/search/ds/products
```

Expected: 401 Unauthorized.

- [ ] **Step 7: Test CAS login flow**

```bash
# Get ST via CAS serviceValidate (simulates frontend flow)
curl -X POST http://localhost:3004/cas/serviceValidate \
  -H "Content-Type: application/json" \
  -d '{"ticket":"invalid","service":"http://ds.example.local/callback"}'
```

Expected: 401 Unauthorized.

- [ ] **Step 8: Test admin-only route**

```bash
# Register a normal user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"user123456"}'

# Login as normal user
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"user123456"}'

# Try to access sync endpoint (admin only)
USER_TOKEN="<paste user token>"
curl -X POST "http://localhost:3000/api/sync/full/ds" \
  -H "Authorization: Bearer $USER_TOKEN"
```

Expected: 403 Forbidden (admin role required).

- [ ] **Step 9: Verify build still passes**

```bash
npx nest build
```

Expected: All 5 services build successfully.

- [ ] **Step 10: Commit final state**

```bash
git add -A
git commit -m "feat: complete CAS SSO implementation"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Auth Service scaffolding | None |
| 2 | Shared library (CAS constants, user interface) | Task 1 |
| 3 | Auth Service - Database layer | Task 1 |
| 4 | Auth Service - User module | Task 3 |
| 5 | Auth Service - CAS module | Task 4 |
| 6 | Auth Service - Auth module (JWT) | Task 5 |
| 7 | Auth Service - App module & main | Task 6 |
| 8 | Gateway - CasGuard integration | Task 2, 7 |
| 9 | Integration testing | All tasks |

**Parallelization opportunities:**
- Tasks 2 and 3 can run in parallel (both depend only on Task 1)
- Tasks 4, 5, 6 are sequential (each depends on the previous)
- Task 8 depends on Tasks 2 and 7
