# nest-search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a microservices backend for IoT product warehouse management with data sync, search, and form submission flows.

**Architecture:** NestJS Monorepo with 4 services (Gateway, Sync, Search, Form) communicating via RabbitMQ. CQRS pattern with ES for reads and MySQL for writes.

**Tech Stack:** NestJS v10+, MySQL 8.0, Drizzle ORM, Elasticsearch 8.12, RabbitMQ 3.x, @nestjs/schedule, class-validator

**Spec:** `docs/superpowers/specs/2026-05-08-nest-search-design.md`

---

## File Structure

```
nest-search/
├── apps/
│   ├── gateway/src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── app.controller.ts
│   │   ├── guards/api-key.guard.ts
│   │   ├── filters/all-exceptions.filter.ts
│   │   └── proxy/proxy.service.ts
│   ├── sync-service/src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── sync/
│   │   │   ├── sync.module.ts
│   │   │   ├── sync.controller.ts
│   │   │   ├── sync.service.ts
│   │   │   ├── sync.scheduler.ts
│   │   │   ├── sync.consumer.ts
│   │   │   └── sync-records.service.ts
│   │   └── mock/
│   │       ├── products-full.json
│   │       └── products-incremental.json
│   ├── search-service/src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── search/
│   │   │   ├── search.module.ts
│   │   │   ├── search.controller.ts
│   │   │   ├── search.service.ts
│   │   │   └── search.queries.ts
│   │   └── elasticsearch/
│   │       ├── elasticsearch.module.ts
│   │       ├── elasticsearch.service.ts
│   │       └── elasticsearch.init.ts
│   └── form-service/src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── database/
│       │   ├── drizzle.module.ts
│       │   ├── drizzle.service.ts
│       │   └── schema/
│       │       ├── business-lines.ts
│       │       ├── sync-records.ts
│       │       └── schema-factory.ts
│       ├── scheme/
│       │   ├── scheme.module.ts
│       │   ├── scheme.controller.ts
│       │   ├── scheme.service.ts
│       │   └── dto/create-scheme.dto.ts
│       └── form/
│           ├── form.module.ts
│           ├── form.controller.ts
│           ├── form.service.ts
│           └── dto/create-form.dto.ts
├── libs/shared/src/
│   ├── index.ts
│   ├── constants/
│   │   ├── business-lines.ts
│   │   └── rabbitmq.ts
│   ├── dto/
│   │   └── pagination.dto.ts
│   └── interfaces/
│       ├── sync-message.interface.ts
│       └── product.interface.ts
├── data/
│   ├── products-full.json
│   └── products-incremental.json
├── docker-compose.yml
├── .env
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.env`

- [ ] **Step 1: Initialize npm project**

```bash
cd /Users/nmsn/Studio/nest-search
npm init -y
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs
npm install @nestjs/microservices amqplib @nestjs/schedule
npm install drizzle-orm mysql2 @elastic/elasticsearch
npm install class-validator class-transformer
npm install dotenv
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D typescript @types/node @nestjs/cli @nestjs/testing
npm install -D drizzle-kit ts-node jest @types/jest ts-jest
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false,
    "paths": {
      "@app/shared": ["libs/shared/src/index.ts"]
    }
  }
}
```

- [ ] **Step 5: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 6: Create nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/gateway/src",
  "monorepo": true,
  "root": "apps/gateway",
  "compilerOptions": {
    "webpack": false,
    "tsConfigPath": "apps/gateway/tsconfig.app.json"
  },
  "projects": {
    "gateway": {
      "type": "application",
      "root": "apps/gateway",
      "entryFile": "main",
      "sourceRoot": "apps/gateway/src",
      "compilerOptions": {
        "tsConfigPath": "apps/gateway/tsconfig.app.json"
      }
    },
    "sync-service": {
      "type": "application",
      "root": "apps/sync-service",
      "entryFile": "main",
      "sourceRoot": "apps/sync-service/src",
      "compilerOptions": {
        "tsConfigPath": "apps/sync-service/tsconfig.app.json"
      }
    },
    "search-service": {
      "type": "application",
      "root": "apps/search-service",
      "entryFile": "main",
      "sourceRoot": "apps/search-service/src",
      "compilerOptions": {
        "tsConfigPath": "apps/search-service/tsconfig.app.json"
      }
    },
    "form-service": {
      "type": "application",
      "root": "apps/form-service",
      "entryFile": "main",
      "sourceRoot": "apps/form-service/src",
      "compilerOptions": {
        "tsConfigPath": "apps/form-service/tsconfig.app.json"
      }
    },
    "shared": {
      "type": "library",
      "root": "libs/shared",
      "entryFile": "index",
      "sourceRoot": "libs/shared/src",
      "compilerOptions": {
        "tsConfigPath": "libs/shared/tsconfig.lib.json"
      }
    }
  }
}
```

- [ ] **Step 7: Create .env**

```env
# MySQL
DATABASE_URL=mysql://root:root123@localhost:3306/nest_search

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# API Keys (per business line)
API_KEY_DS=ds_key_123
API_KEY_ZK=zk_key_456
API_KEY_MEETING=meeting_key_789

# Service Ports
GATEWAY_PORT=3000
SYNC_SERVICE_PORT=3001
SEARCH_SERVICE_PORT=3002
FORM_SERVICE_PORT=3003
```

- [ ] **Step 8: Update package.json scripts**

```json
{
  "scripts": {
    "build": "nest build",
    "start:gateway": "nest start gateway",
    "start:sync": "nest start sync-service",
    "start:search": "nest start search-service",
    "start:form": "nest start form-service",
    "start:all": "concurrently \"npm run start:gateway\" \"npm run start:sync\" \"npm run start:search\" \"npm run start:form\"",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down"
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json tsconfig.build.json nest-cli.json .env
git commit -m "chore: initialize NestJS monorepo with project config"
```

---

## Task 2: Docker Compose Infrastructure

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: nest-search-mysql
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: nest_search
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  elasticsearch:
    image: elasticsearch:8.12.0
    container_name: nest-search-es
    ports:
      - "9200:9200"
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management
    container_name: nest-search-rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_running"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql_data:
  es_data:
  rabbitmq_data:
```

- [ ] **Step 2: Start Docker services**

```bash
docker-compose up -d
```

- [ ] **Step 3: Verify all services are running**

```bash
docker-compose ps
```

Expected: All 3 services showing "Up" status.

- [ ] **Step 4: Verify MySQL connection**

```bash
docker exec nest-search-mysql mysql -u root -proot123 -e "SHOW DATABASES;"
```

Expected: `nest_search` database listed.

- [ ] **Step 5: Verify Elasticsearch**

```bash
curl http://localhost:9200/_cluster/health
```

Expected: JSON response with `"status": "green"` or `"yellow"`.

- [ ] **Step 6: Verify RabbitMQ Management UI**

Open http://localhost:15672 in browser, login with guest/guest.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add Docker Compose for MySQL, ES, RabbitMQ"
```

---

## Task 3: Shared Library

**Files:**
- Create: `libs/shared/src/index.ts`
- Create: `libs/shared/src/constants/business-lines.ts`
- Create: `libs/shared/src/constants/rabbitmq.ts`
- Create: `libs/shared/src/interfaces/sync-message.interface.ts`
- Create: `libs/shared/src/interfaces/product.interface.ts`
- Create: `libs/shared/src/dto/pagination.dto.ts`
- Create: `libs/shared/src/schemas/sync-records.ts`
- Create: `libs/shared/tsconfig.lib.json`

- [ ] **Step 1: Create shared constants - business lines**

```typescript
// libs/shared/src/constants/business-lines.ts
export const BUSINESS_LINES = {
  ds: {
    code: 'ds',
    name: '商显',
    tablePrefix: 'ds_',
    esIndex: 'products_ds',
  },
  zk: {
    code: 'zk',
    name: '道闸',
    tablePrefix: 'zk_',
    esIndex: 'products_zk',
  },
  meeting: {
    code: 'meeting',
    name: '会议平板',
    tablePrefix: 'mt_',
    esIndex: 'products_meeting',
  },
} as const;

export type BusinessLineCode = keyof typeof BUSINESS_LINES;

export function isValidBusinessLine(code: string): code is BusinessLineCode {
  return code in BUSINESS_LINES;
}
```

- [ ] **Step 2: Create shared constants - RabbitMQ**

```typescript
// libs/shared/src/constants/rabbitmq.ts
export const RABBITMQ_CONFIG = {
  url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  exchanges: {
    sync: 'sync.exchange',
    event: 'event.exchange',
  },
  queues: {
    syncFull: (bl: string) => `sync.full.${bl}.queue`,
    syncIncremental: (bl: string) => `sync.incremental.${bl}.queue`,
    formSubmitted: 'event.form.submitted.queue',
  },
  routingKeys: {
    syncFull: (bl: string) => `sync.full.${bl}`,
    syncIncremental: (bl: string) => `sync.incremental.${bl}`,
    formSubmitted: 'form.submitted',
  },
};
```

- [ ] **Step 3: Create shared interfaces - sync message**

```typescript
// libs/shared/src/interfaces/sync-message.interface.ts
export interface SyncMessage {
  businessLine: string;
  triggeredBy: 'cron' | 'manual';
  timestamp: Date;
}

export interface SyncFullMessage extends SyncMessage {
  type: 'full';
}

export interface SyncIncrementalMessage extends SyncMessage {
  type: 'incremental';
  lastSyncTime: Date;
}

export interface FormSubmittedEvent {
  formId: number;
  businessLine: string;
  schemeId: number;
  totalAmount: number;
  timestamp: Date;
}
```

- [ ] **Step 4: Create shared interfaces - product**

```typescript
// libs/shared/src/interfaces/product.interface.ts
export interface Product {
  productId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  spec: string;
  price: number;
  unit: string;
  stock: number;
  imageUrl: string;
  attributes: Record<string, any>;
  syncedAt: Date;
  businessLine: string;
}
```

- [ ] **Step 5: Create shared DTO - pagination**

```typescript
// libs/shared/src/dto/pagination.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 20;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  size: number;
  items: T[];
}
```

- [ ] **Step 6: Create shared schema - sync records**

```typescript
// libs/shared/src/schemas/sync-records.ts
import { mysqlTable, int, text, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const syncRecords = mysqlTable('sync_records', {
  id: int('id').primaryKey().autoincrement(),
  type: mysqlEnum('type', ['incremental', 'full']).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'success', 'failed']).default('pending'),
  recordsCount: int('records_count').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

- [ ] **Step 7: Create shared index**

```typescript
// libs/shared/src/index.ts
export * from './constants/business-lines';
export * from './constants/rabbitmq';
export * from './interfaces/sync-message.interface';
export * from './interfaces/product.interface';
export * from './dto/pagination.dto';
export * from './schemas/sync-records';
```

- [ ] **Step 8: Create shared tsconfig**

```json
// libs/shared/tsconfig.lib.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "outDir": "../../dist/libs/shared"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 9: Commit**

```bash
git add libs/
git commit -m "feat: add shared library with constants, interfaces, DTOs, schemas"
```

---

## Task 4: Form Service - Database Layer

**Files:**
- Create: `apps/form-service/src/database/schema/business-lines.ts`
- Create: `apps/form-service/src/database/schema/schema-factory.ts`
- Create: `apps/form-service/src/database/drizzle.service.ts`
- Create: `apps/form-service/src/database/drizzle.module.ts`
- Create: `apps/form-service/tsconfig.app.json`

Note: `syncRecords` schema is in `libs/shared/src/schemas/sync-records.ts` (Task 3).

- [ ] **Step 1: Create form service tsconfig**

```json
// apps/form-service/tsconfig.app.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/form-service"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 2: Create business-lines schema**

```typescript
// apps/form-service/src/database/schema/business-lines.ts
import { mysqlTable, int, varchar, timestamp } from 'drizzle-orm/mysql-core';

export const businessLines = mysqlTable('business_lines', {
  id: int('id').primaryKey().autoincrement(),
  code: varchar('code', { length: 50 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  tablePrefix: varchar('table_prefix', { length: 20 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

- [ ] **Step 3: Create schema factory for dynamic tables**

```typescript
// apps/form-service/src/database/schema/schema-factory.ts
import { mysqlTable, int, varchar, text, json, decimal, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

function createSchemesTable(prefix: string) {
  return mysqlTable(`${prefix}schemes`, {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', ['draft', 'published', 'archived']).default('draft'),
    config: json('config'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  });
}

function createFormsTable(prefix: string) {
  return mysqlTable(`${prefix}forms`, {
    id: int('id').primaryKey().autoincrement(),
    schemeId: int('scheme_id').notNull(),
    productIds: json('product_ids').$type<string[]>().notNull(),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    totalQuantity: int('total_quantity').notNull(),
    status: mysqlEnum('status', ['draft', 'submitted', 'approved']).default('draft'),
    formData: json('form_data').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  });
}

export const TABLES = {
  ds: {
    schemes: createSchemesTable('ds_'),
    forms: createFormsTable('ds_'),
  },
  zk: {
    schemes: createSchemesTable('zk_'),
    forms: createFormsTable('zk_'),
  },
  meeting: {
    schemes: createSchemesTable('mt_'),
    forms: createFormsTable('mt_'),
  },
} as const;

export type BusinessLineCode = keyof typeof TABLES;

export function getBusinessLineTables(businessLine: string) {
  const tables = TABLES[businessLine as BusinessLineCode];
  if (!tables) throw new Error(`Unknown business line: ${businessLine}`);
  return tables;
}
```

- [ ] **Step 4: Create Drizzle service**

```typescript
// apps/form-service/src/database/drizzle.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2';
import * as schema from './schema/schema-factory';
import { businessLines } from './schema/business-lines';
import { syncRecords } from '@app/shared';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db: ReturnType<typeof drizzle>;

  async onModuleInit() {
    const connection = createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });

    this.db = drizzle(connection, {
      schema: { ...schema, businessLines, syncRecords },
      mode: 'default',
    });

    await this.initBusinessLines();
  }

  private async initBusinessLines() {
    const lines = [
      { code: 'ds', name: '商显', tablePrefix: 'ds_' },
      { code: 'zk', name: '道闸', tablePrefix: 'zk_' },
      { code: 'meeting', name: '会议平板', tablePrefix: 'mt_' },
    ];

    for (const line of lines) {
      await this.db.insert(businessLines)
        .values(line)
        .onDuplicateKeyUpdate({ set: { name: line.name } });
    }
  }
}
```

- [ ] **Step 5: Create Drizzle module**

```typescript
// apps/form-service/src/database/drizzle.module.ts
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
git add apps/form-service/
git commit -m "feat: add Form Service database layer with Drizzle ORM"
```

---

## Task 5: Form Service - Scheme Module

**Files:**
- Create: `apps/form-service/src/scheme/dto/create-scheme.dto.ts`
- Create: `apps/form-service/src/scheme/scheme.service.ts`
- Create: `apps/form-service/src/scheme/scheme.controller.ts`
- Create: `apps/form-service/src/scheme/scheme.module.ts`

- [ ] **Step 1: Create Scheme DTO**

```typescript
// apps/form-service/src/scheme/dto/create-scheme.dto.ts
import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';

export class CreateSchemeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class UpdateSchemeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
```

- [ ] **Step 2: Create Scheme service**

```typescript
// apps/form-service/src/scheme/scheme.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../database/dizzle.service';
import { getBusinessLineTables } from '../database/schema/schema-factory';
import { eq } from 'drizzle-orm';
import { CreateSchemeDto, UpdateSchemeDto } from './dto/create-scheme.dto';

@Injectable()
export class SchemeService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(businessLine: string, dto: CreateSchemeDto) {
    const tables = getBusinessLineTables(businessLine);
    const [result] = await this.drizzle.db
      .insert(tables.schemes)
      .values({
        name: dto.name,
        description: dto.description,
        status: dto.status as any,
        config: dto.config,
      })
      .returning();
    return result;
  }

  async findAll(businessLine: string) {
    const tables = getBusinessLineTables(businessLine);
    return this.drizzle.db.select().from(tables.schemes);
  }

  async findOne(businessLine: string, id: number) {
    const tables = getBusinessLineTables(businessLine);
    const [result] = await this.drizzle.db
      .select()
      .from(tables.schemes)
      .where(eq(tables.schemes.id, id))
      .limit(1);

    if (!result) throw new NotFoundException(`Scheme #${id} not found`);
    return result;
  }

  async update(businessLine: string, id: number, dto: UpdateSchemeDto) {
    const tables = getBusinessLineTables(businessLine);
    await this.findOne(businessLine, id);

    const [result] = await this.drizzle.db
      .update(tables.schemes)
      .set({
        ...dto,
        status: dto.status as any,
      })
      .where(eq(tables.schemes.id, id))
      .returning();
    return result;
  }

  async remove(businessLine: string, id: number) {
    const tables = getBusinessLineTables(businessLine);
    await this.findOne(businessLine, id);
    await this.drizzle.db
      .delete(tables.schemes)
      .where(eq(tables.schemes.id, id));
    return { deleted: true };
  }
}
```

- [ ] **Step 3: Create Scheme controller**

```typescript
// apps/form-service/src/scheme/scheme.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { SchemeService } from './scheme.service';
import { CreateSchemeDto, UpdateSchemeDto } from './dto/create-scheme.dto';

@Controller('api/form/:businessLine/schemes')
export class SchemeController {
  constructor(private readonly schemeService: SchemeService) {}

  @Post()
  create(
    @Param('businessLine') businessLine: string,
    @Body() dto: CreateSchemeDto,
  ) {
    return this.schemeService.create(businessLine, dto);
  }

  @Get()
  findAll(@Param('businessLine') businessLine: string) {
    return this.schemeService.findAll(businessLine);
  }

  @Get(':id')
  findOne(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.schemeService.findOne(businessLine, id);
  }

  @Patch(':id')
  update(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchemeDto,
  ) {
    return this.schemeService.update(businessLine, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.schemeService.remove(businessLine, id);
  }
}
```

- [ ] **Step 4: Create Scheme module**

```typescript
// apps/form-service/src/scheme/scheme.module.ts
import { Module } from '@nestjs/common';
import { SchemeController } from './scheme.controller';
import { SchemeService } from './scheme.service';

@Module({
  controllers: [SchemeController],
  providers: [SchemeService],
  exports: [SchemeService],
})
export class SchemeModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/form-service/src/scheme/
git commit -m "feat: add Scheme CRUD module to Form Service"
```

---

## Task 6: Form Service - Form Module

**Files:**
- Create: `apps/form-service/src/form/dto/create-form.dto.ts`
- Create: `apps/form-service/src/form/form.service.ts`
- Create: `apps/form-service/src/form/form.controller.ts`
- Create: `apps/form-service/src/form/form.module.ts`

- [ ] **Step 1: Create Form DTO**

```typescript
// apps/form-service/src/form/dto/create-form.dto.ts
import { IsNumber, IsArray, IsString, IsObject, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFormDto {
  @IsNumber()
  schemeId: number;

  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @IsObject()
  formData: {
    customerName: string;
    contact: string;
    phone: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    totalAmount: number;
    totalQuantity: number;
  };
}

export class UpdateFormStatusDto {
  @IsEnum(['draft', 'submitted', 'approved'])
  status: string;
}
```

- [ ] **Step 2: Create Form service**

```typescript
// apps/form-service/src/form/form.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../database/dizzle.service';
import { getBusinessLineTables } from '../database/schema/schema-factory';
import { eq } from 'drizzle-orm';
import { CreateFormDto, UpdateFormStatusDto } from './dto/create-form.dto';

@Injectable()
export class FormService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(businessLine: string, dto: CreateFormDto) {
    const tables = getBusinessLineTables(businessLine);

    // Calculate totals from formData
    const totalAmount = dto.formData.items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );
    const totalQuantity = dto.formData.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const [result] = await this.drizzle.db
      .insert(tables.forms)
      .values({
        schemeId: dto.schemeId,
        productIds: dto.productIds,
        totalAmount: totalAmount.toString(),
        totalQuantity,
        formData: dto.formData,
      })
      .returning();

    return result;
  }

  async findAll(businessLine: string) {
    const tables = getBusinessLineTables(businessLine);
    return this.drizzle.db.select().from(tables.forms);
  }

  async findOne(businessLine: string, id: number) {
    const tables = getBusinessLineTables(businessLine);
    const [result] = await this.drizzle.db
      .select()
      .from(tables.forms)
      .where(eq(tables.forms.id, id))
      .limit(1);

    if (!result) throw new NotFoundException(`Form #${id} not found`);
    return result;
  }

  async updateStatus(businessLine: string, id: number, dto: UpdateFormStatusDto) {
    const tables = getBusinessLineTables(businessLine);
    await this.findOne(businessLine, id);

    const [result] = await this.drizzle.db
      .update(tables.forms)
      .set({ status: dto.status as any })
      .where(eq(tables.forms.id, id))
      .returning();

    return result;
  }
}
```

- [ ] **Step 3: Create Form controller**

```typescript
// apps/form-service/src/form/form.controller.ts
import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe } from '@nestjs/common';
import { FormService } from './form.service';
import { CreateFormDto, UpdateFormStatusDto } from './dto/create-form.dto';

@Controller('api/form/:businessLine/forms')
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post()
  create(
    @Param('businessLine') businessLine: string,
    @Body() dto: CreateFormDto,
  ) {
    return this.formService.create(businessLine, dto);
  }

  @Get()
  findAll(@Param('businessLine') businessLine: string) {
    return this.formService.findAll(businessLine);
  }

  @Get(':id')
  findOne(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.formService.findOne(businessLine, id);
  }

  @Patch(':id')
  updateStatus(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormStatusDto,
  ) {
    return this.formService.updateStatus(businessLine, id, dto);
  }
}
```

- [ ] **Step 4: Create Form module**

```typescript
// apps/form-service/src/form/form.module.ts
import { Module } from '@nestjs/common';
import { FormController } from './form.controller';
import { FormService } from './form.service';

@Module({
  controllers: [FormController],
  providers: [FormService],
  exports: [FormService],
})
export class FormModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/form-service/src/form/
git commit -m "feat: add Form CRUD module to Form Service"
```

---

## Task 7: Form Service - App Module & Main

**Files:**
- Create: `apps/form-service/src/app.module.ts`
- Create: `apps/form-service/src/main.ts`

- [ ] **Step 1: Create Form Service app module**

```typescript
// apps/form-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './database/drizzle.module';
import { SchemeModule } from './scheme/scheme.module';
import { FormModule } from './form/form.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    SchemeModule,
    FormModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Create Form Service main.ts**

```typescript
// apps/form-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = process.env.FORM_SERVICE_PORT || 3003;
  await app.listen(port);
  console.log(`Form Service running on port ${port}`);
}
bootstrap();
```

- [ ] **Step 3: Install config module**

```bash
npm install @nestjs/config
```

- [ ] **Step 4: Test Form Service starts**

```bash
npm run start:form
```

Expected: "Form Service running on port 3003"

- [ ] **Step 5: Commit**

```bash
git add apps/form-service/src/app.module.ts apps/form-service/src/main.ts package.json
git commit -m "feat: add Form Service app module and entry point"
```

---

## Task 8: Search Service - Elasticsearch Layer

**Files:**
- Create: `apps/search-service/src/elasticsearch/elasticsearch.service.ts`
- Create: `apps/search-service/src/elasticsearch/elasticsearch.init.ts`
- Create: `apps/search-service/src/elasticsearch/elasticsearch.module.ts`
- Create: `apps/search-service/tsconfig.app.json`

- [ ] **Step 1: Create Search Service tsconfig**

```json
// apps/search-service/tsconfig.app.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/search-service"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 2: Create Elasticsearch service**

```typescript
// apps/search-service/src/elasticsearch/elasticsearch.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  public client: Client;

  onModuleInit() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });
  }

  async createIndexIfNotExists(indexName: string, mappings: any) {
    const exists = await this.client.indices.exists({ index: indexName });
    if (!exists) {
      await this.client.indices.create({
        index: indexName,
        body: { mappings },
      });
      console.log(`Created ES index: ${indexName}`);
    }
  }

  async bulkIndex(indexName: string, documents: any[]) {
    if (documents.length === 0) return;

    const operations = documents.flatMap((doc) => [
      { index: { _index: indexName, _id: doc.productId } },
      doc,
    ]);

    const result = await this.client.bulk({ operations });
    if (result.errors) {
      console.error('Bulk index errors:', result.items.filter((i) => i.index?.error));
    }

    return { indexed: documents.length, errors: result.errors };
  }

  async search(indexName: string, body: any) {
    return this.client.search({ index: indexName, body });
  }

  async getDocument(indexName: string, id: string) {
    try {
      const result = await this.client.get({ index: indexName, id });
      return result._source;
    } catch (error) {
      if (error.meta?.statusCode === 404) return null;
      throw error;
    }
  }

  async deleteByQuery(indexName: string, query: any) {
    return this.client.deleteByQuery({ index: indexName, body: { query } });
  }
}
```

- [ ] **Step 3: Create ES index initialization**

```typescript
// apps/search-service/src/elasticsearch/elasticsearch.init.ts
import { ElasticsearchService } from './elasticsearch.service';
import { BUSINESS_LINES } from '@app/shared';

const PRODUCT_MAPPINGS = {
  properties: {
    productId: { type: 'keyword' },
    name: { type: 'text', analyzer: 'standard' },
    category: { type: 'keyword' },
    brand: { type: 'keyword' },
    model: { type: 'keyword' },
    spec: { type: 'text' },
    price: { type: 'float' },
    unit: { type: 'keyword' },
    stock: { type: 'integer' },
    imageUrl: { type: 'keyword', index: false },
    attributes: { type: 'object', enabled: false },
    syncedAt: { type: 'date' },
    businessLine: { type: 'keyword' },
  },
};

export async function initIndices(esService: ElasticsearchService) {
  for (const [, config] of Object.entries(BUSINESS_LINES)) {
    await esService.createIndexIfNotExists(config.esIndex, PRODUCT_MAPPINGS);
  }
}
```

Note: Using `standard` analyzer instead of `ik_max_word` for simplicity. IK analyzer requires a separate plugin installation. Can be added later.

- [ ] **Step 4: Create Elasticsearch module**

```typescript
// apps/search-service/src/elasticsearch/elasticsearch.module.ts
import { Global, Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';

@Global()
@Module({
  providers: [ElasticsearchService],
  exports: [ElasticsearchService],
})
export class ElasticsearchModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/search-service/
git commit -m "feat: add Search Service Elasticsearch layer"
```

---

## Task 9: Search Service - Search Module

**Files:**
- Create: `apps/search-service/src/search/search.queries.ts`
- Create: `apps/search-service/src/search/search.service.ts`
- Create: `apps/search-service/src/search/search.controller.ts`
- Create: `apps/search-service/src/search/search.module.ts`

- [ ] **Step 1: Create search query builders**

```typescript
// apps/search-service/src/search/search.queries.ts
import { BUSINESS_LINES } from '@app/shared';

export function buildProductSearchQuery(params: {
  keyword?: string;
  category?: string;
  brand?: string;
  page: number;
  size: number;
}) {
  const must: any[] = [];
  const filter: any[] = [];

  if (params.keyword) {
    must.push({
      multi_match: {
        query: params.keyword,
        fields: ['name^3', 'spec', 'brand', 'model'],
      },
    });
  }

  if (params.category) {
    filter.push({ term: { category: params.category } });
  }

  if (params.brand) {
    filter.push({ term: { brand: params.brand } });
  }

  return {
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    from: (params.page - 1) * params.size,
    size: params.size,
    sort: [{ _score: 'desc' }, { syncedAt: 'desc' }],
  };
}

export function buildAggregationQuery() {
  return {
    size: 0,
    aggs: {
      categories: {
        terms: { field: 'category', size: 50 },
      },
      brands: {
        terms: { field: 'brand', size: 50 },
      },
      price_stats: {
        stats: { field: 'price' },
      },
    },
  };
}
```

- [ ] **Step 2: Create Search service**

```typescript
// apps/search-service/src/search/search.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { BUSINESS_LINES, isValidBusinessLine } from '@app/shared';
import { buildProductSearchQuery, buildAggregationQuery } from './search.queries';

@Injectable()
export class SearchService {
  constructor(private readonly esService: ElasticsearchService) {}

  private getIndex(businessLine: string): string {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return BUSINESS_LINES[businessLine].esIndex;
  }

  async searchProducts(
    businessLine: string,
    params: {
      keyword?: string;
      category?: string;
      brand?: string;
      page: number;
      size: number;
    },
  ) {
    const index = this.getIndex(businessLine);
    const query = buildProductSearchQuery(params);
    const result = await this.esService.search(index, query);

    return {
      total: result.hits.total,
      page: params.page,
      size: params.size,
      items: result.hits.hits.map((hit: any) => hit._source),
    };
  }

  async getProduct(businessLine: string, productId: string) {
    const index = this.getIndex(businessLine);
    const product = await this.esService.getDocument(index, productId);
    if (!product) {
      throw new BadRequestException(`Product ${productId} not found`);
    }
    return product;
  }

  async getAggregations(businessLine: string) {
    const index = this.getIndex(businessLine);
    const query = buildAggregationQuery();
    const result = await this.esService.search(index, query);

    return {
      categories: result.aggregations.categories.buckets,
      brands: result.aggregations.brands.buckets,
      priceStats: result.aggregations.price_stats,
    };
  }
}
```

- [ ] **Step 3: Create Search controller**

```typescript
// apps/search-service/src/search/search.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api/search/:businessLine')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('products')
  searchProducts(
    @Param('businessLine') businessLine: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
  ) {
    return this.searchService.searchProducts(businessLine, {
      keyword,
      category,
      brand,
      page: parseInt(page, 10),
      size: parseInt(size, 10),
    });
  }

  @Get('products/:id')
  getProduct(
    @Param('businessLine') businessLine: string,
    @Param('id') id: string,
  ) {
    return this.searchService.getProduct(businessLine, id);
  }

  @Get('aggregations')
  getAggregations(@Param('businessLine') businessLine: string) {
    return this.searchService.getAggregations(businessLine);
  }
}
```

- [ ] **Step 4: Create Search module**

```typescript
// apps/search-service/src/search/search.module.ts
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/search-service/src/search/
git commit -m "feat: add Search module with product search and aggregations"
```

---

## Task 10: Search Service - App Module & Main

**Files:**
- Create: `apps/search-service/src/app.module.ts`
- Create: `apps/search-service/src/main.ts`

- [ ] **Step 1: Create Search Service app module**

```typescript
// apps/search-service/src/app.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { ElasticsearchService } from './elasticsearch/elasticsearch.service';
import { SearchModule } from './search/search.module';
import { initIndices } from './elasticsearch/elasticsearch.init';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ElasticsearchModule,
    SearchModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly esService: ElasticsearchService) {}

  async onModuleInit() {
    await initIndices(this.esService);
  }
}
```

- [ ] **Step 2: Create Search Service main.ts**

```typescript
// apps/search-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = process.env.SEARCH_SERVICE_PORT || 3002;
  await app.listen(port);
  console.log(`Search Service running on port ${port}`);
}
bootstrap();
```

- [ ] **Step 3: Test Search Service starts**

```bash
npm run start:search
```

Expected: "Search Service running on port 3002" and ES indices created.

- [ ] **Step 4: Commit**

```bash
git add apps/search-service/src/app.module.ts apps/search-service/src/main.ts
git commit -m "feat: add Search Service app module and entry point"
```

---

## Task 11: Sync Service - Mock Data

**Files:**
- Create: `apps/sync-service/src/mock/products-full.json`
- Create: `apps/sync-service/src/mock/products-incremental.json`
- Create: `apps/sync-service/tsconfig.app.json`

- [ ] **Step 1: Create Sync Service tsconfig**

```json
// apps/sync-service/tsconfig.app.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/sync-service"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 2: Create full product mock data**

```json
// apps/sync-service/src/mock/products-full.json
[
  {
    "productId": "P001",
    "name": "海信 65 寸 4K 商用显示器",
    "category": "商显",
    "brand": "海信",
    "model": "H65E3A",
    "spec": "65英寸/4K/300nit/16:9",
    "price": 4999.00,
    "unit": "台",
    "stock": 50,
    "imageUrl": "https://example.com/p001.jpg",
    "attributes": { "resolution": "3840x2160", "brightness": "300cd/m2" },
    "businessLine": "ds"
  },
  {
    "productId": "P002",
    "name": "创维 55 寸 商用广告机",
    "category": "商显",
    "brand": "创维",
    "model": "55A5",
    "spec": "55英寸/1080P/350nit",
    "price": 3299.00,
    "unit": "台",
    "stock": 80,
    "imageUrl": "https://example.com/p002.jpg",
    "attributes": { "resolution": "1920x1080", "brightness": "350cd/m2" },
    "businessLine": "ds"
  },
  {
    "productId": "P003",
    "name": "海康威视 道闸一体机",
    "category": "道闸",
    "brand": "海康威视",
    "model": "DS-TMG300",
    "spec": "3米杆/快速通行/车牌识别",
    "price": 8500.00,
    "unit": "套",
    "stock": 20,
    "imageUrl": "https://example.com/p003.jpg",
    "attributes": { "barLength": "3m", "openTime": "0.6s" },
    "businessLine": "zk"
  },
  {
    "productId": "P004",
    "name": "MAXHUB 75 寸 会议平板",
    "category": "会议平板",
    "brand": "MAXHUB",
    "model": "V75",
    "spec": "75英寸/4K/触控/无线投屏",
    "price": 12999.00,
    "unit": "台",
    "stock": 15,
    "imageUrl": "https://example.com/p004.jpg",
    "attributes": { "touchPoints": "20", "os": "Android 11" },
    "businessLine": "meeting"
  },
  {
    "productId": "P005",
    "name": "TCL 86 寸 智能交互平板",
    "category": "会议平板",
    "brand": "TCL",
    "model": "M86A",
    "spec": "86英寸/4K/红外触控/内置音箱",
    "price": 18999.00,
    "unit": "台",
    "stock": 8,
    "imageUrl": "https://example.com/p005.jpg",
    "attributes": { "touchPoints": "20", "speaker": "2x15W" },
    "businessLine": "meeting"
  }
]
```

- [ ] **Step 3: Create incremental product mock data**

```json
// apps/sync-service/src/mock/products-incremental.json
[
  {
    "productId": "P001",
    "name": "海信 65 寸 4K 商用显示器",
    "category": "商显",
    "brand": "海信",
    "model": "H65E3A",
    "spec": "65英寸/4K/300nit/16:9",
    "price": 4799.00,
    "unit": "台",
    "stock": 45,
    "imageUrl": "https://example.com/p001.jpg",
    "attributes": { "resolution": "3840x2160", "brightness": "300cd/m2" },
    "businessLine": "ds"
  },
  {
    "productId": "P006",
    "name": "大华 高速道闸",
    "category": "道闸",
    "brand": "大华",
    "model": "DH-IPMBG-1000",
    "spec": "4.5米杆/高速通行/防砸",
    "price": 12000.00,
    "unit": "套",
    "stock": 10,
    "imageUrl": "https://example.com/p006.jpg",
    "attributes": { "barLength": "4.5m", "openTime": "0.4s" },
    "businessLine": "zk"
  }
]
```

- [ ] **Step 4: Copy mock data to project root data/ directory**

```bash
mkdir -p data
cp apps/sync-service/src/mock/products-full.json data/
cp apps/sync-service/src/mock/products-incremental.json data/
```

- [ ] **Step 5: Commit**

```bash
git add apps/sync-service/src/mock/ data/ apps/sync-service/tsconfig.app.json
git commit -m "feat: add mock product data for sync service"
```

---

## Task 12: Sync Service - RabbitMQ & Sync Module

**Files:**
- Create: `apps/sync-service/src/sync/sync.service.ts`
- Create: `apps/sync-service/src/sync/sync.consumer.ts`
- Create: `apps/sync-service/src/sync/sync.scheduler.ts`
- Create: `apps/sync-service/src/sync/sync.controller.ts`
- Create: `apps/sync-service/src/sync/sync.module.ts`

- [ ] **Step 1: Create Sync service**

```typescript
// apps/sync-service/src/sync/sync.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy, Client, Transport } from '@nestjs/microservices';
import { RABBITMQ_CONFIG, BUSINESS_LINES, BusinessLineCode } from '@app/shared';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  @Client({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_CONFIG.url],
      queue: 'sync-service-producer',
      queueOptions: { durable: false },
    },
  })
  private client: ClientProxy;

  async onModuleInit() {
    await this.client.connect();
    this.logger.log('Connected to RabbitMQ');
  }

  async triggerFullSync(businessLine: BusinessLineCode) {
    this.logger.log(`Triggering full sync for ${businessLine}`);
    const message = {
      businessLine,
      type: 'full' as const,
      triggeredBy: 'manual' as const,
      timestamp: new Date(),
    };

    // emit sends to exchange with routing key; consumer binds its queue to this key
    this.client.emit(RABBITMQ_CONFIG.routingKeys.syncFull(businessLine), message);
    return { status: 'queued', type: 'full', businessLine };
  }

  async triggerIncrementalSync(businessLine: BusinessLineCode) {
    this.logger.log(`Triggering incremental sync for ${businessLine}`);
    const message = {
      businessLine,
      type: 'incremental' as const,
      triggeredBy: 'manual' as const,
      lastSyncTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      timestamp: new Date(),
    };

    this.client.emit(RABBITMQ_CONFIG.routingKeys.syncIncremental(businessLine), message);
    return { status: 'queued', type: 'incremental', businessLine };
  }

  loadMockData(type: 'full' | 'incremental') {
    const fileName = type === 'full' ? 'products-full.json' : 'products-incremental.json';
    const filePath = path.join(process.cwd(), 'data', fileName);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    return data.map((product: any) => ({
      ...product,
      syncedAt: new Date().toISOString(),
    }));
  }
}
```

- [ ] **Step 2: Create Sync consumer**

```typescript
// apps/sync-service/src/sync/sync.consumer.ts
import { Injectable, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Client } from '@elastic/elasticsearch';
import { RABBITMQ_CONFIG, BUSINESS_LINES, BusinessLineCode } from '@app/shared';
import { SyncService } from './sync.service';

@Injectable()
export class SyncConsumer {
  private readonly logger = new Logger(SyncConsumer.name);
  private esClient: Client;
  private retryCount = new Map<string, number>();

  constructor(private readonly syncService: SyncService) {
    this.esClient = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });
  }

  // Listen on individual routing keys per business line (not wildcards)
  @EventPattern('sync.full.ds')
  async handleFullSyncDs(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processFullSync('ds', data, context);
  }

  @EventPattern('sync.full.zk')
  async handleFullSyncZk(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processFullSync('zk', data, context);
  }

  @EventPattern('sync.full.meeting')
  async handleFullSyncMeeting(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processFullSync('meeting', data, context);
  }

  @EventPattern('sync.incremental.ds')
  async handleIncrementalSyncDs(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processIncrementalSync('ds', data, context);
  }

  @EventPattern('sync.incremental.zk')
  async handleIncrementalSyncZk(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processIncrementalSync('zk', data, context);
  }

  @EventPattern('sync.incremental.meeting')
  async handleIncrementalSyncMeeting(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processIncrementalSync('meeting', data, context);
  }

  private async processFullSync(businessLine: BusinessLineCode, data: any, context: RmqContext) {
    this.logger.log(`Processing full sync for ${businessLine}`);
    const pattern = `sync.full.${businessLine}`;

    try {
      const products = this.syncService.loadMockData('full');
      const filtered = products.filter((p: any) => p.businessLine === businessLine);

      if (filtered.length === 0) {
        this.logger.warn(`No products found for business line: ${businessLine}`);
        return;
      }

      const index = BUSINESS_LINES[businessLine].esIndex;

      // Clear existing data for full sync
      await this.esClient.deleteByQuery({
        index,
        body: { query: { match_all: {} } },
      });

      // Bulk index new data
      const operations = filtered.flatMap((doc: any) => [
        { index: { _index: index, _id: doc.productId } },
        doc,
      ]);

      await this.esClient.bulk({ operations });
      this.logger.log(`Full sync complete for ${businessLine}: ${filtered.length} products indexed`);

      this.retryCount.delete(pattern);
    } catch (error) {
      this.logger.error(`Full sync failed for ${businessLine}: ${error.message}`);
      this.handleRetry(context, pattern);
    }
  }

  private async processIncrementalSync(businessLine: BusinessLineCode, data: any, context: RmqContext) {
    this.logger.log(`Processing incremental sync for ${businessLine}`);
    const pattern = `sync.incremental.${businessLine}`;

    try {
      const products = this.syncService.loadMockData('incremental');
      const filtered = products.filter((p: any) => p.businessLine === businessLine);

      if (filtered.length === 0) {
        this.logger.log(`No incremental data for ${businessLine}`);
        return;
      }

      const index = BUSINESS_LINES[businessLine].esIndex;

      const operations = filtered.flatMap((doc: any) => [
        { index: { _index: index, _id: doc.productId } },
        doc,
      ]);

      await this.esClient.bulk({ operations });
      this.logger.log(`Incremental sync complete for ${businessLine}: ${filtered.length} products`);

      this.retryCount.delete(pattern);
    } catch (error) {
      this.logger.error(`Incremental sync failed for ${businessLine}: ${error.message}`);
      this.handleRetry(context, pattern);
    }
  }

  private handleRetry(context: RmqContext, pattern: string) {
    const currentRetries = this.retryCount.get(pattern) || 0;
    if (currentRetries < 3) {
      this.retryCount.set(pattern, currentRetries + 1);
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.nack(originalMsg, false, true);
      this.logger.warn(`Retrying ${pattern} (attempt ${currentRetries + 1}/3)`);
    } else {
      this.logger.error(`Max retries reached for ${pattern}`);
      this.retryCount.delete(pattern);
    }
  }
}
```

- [ ] **Step 3: Create Sync scheduler**

```typescript
// apps/sync-service/src/sync/sync.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from './sync.service';
import { BUSINESS_LINES, BusinessLineCode } from '@app/shared';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(private readonly syncService: SyncService) {}

  // Daily at 02:00 - incremental sync for all business lines
  @Cron('0 2 * * *')
  async handleDailyIncrementalSync() {
    this.logger.log('Starting daily incremental sync for all business lines');

    for (const code of Object.keys(BUSINESS_LINES)) {
      try {
        await this.syncService.triggerIncrementalSync(code as BusinessLineCode);
      } catch (error) {
        this.logger.error(`Incremental sync failed for ${code}: ${error.message}`);
      }
    }
  }

  // Weekly on Sunday at 03:00 - full sync for all business lines
  @Cron('0 3 * * 0')
  async handleWeeklyFullSync() {
    this.logger.log('Starting weekly full sync for all business lines');

    for (const code of Object.keys(BUSINESS_LINES)) {
      try {
        await this.syncService.triggerFullSync(code as BusinessLineCode);
      } catch (error) {
        this.logger.error(`Full sync failed for ${code}: ${error.message}`);
      }
    }
  }
}
```

- [ ] **Step 4: Create Sync controller**

```typescript
// apps/sync-service/src/sync/sync.controller.ts
import { Controller, Post, Get, Param, BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncRecordsService } from './sync-records.service';
import { isValidBusinessLine } from '@app/shared';

@Controller('api/sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly syncRecordsService: SyncRecordsService,
  ) {}

  @Post('full/:businessLine')
  triggerFullSync(@Param('businessLine') businessLine: string) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return this.syncService.triggerFullSync(businessLine);
  }

  @Post('incremental/:businessLine')
  triggerIncrementalSync(@Param('businessLine') businessLine: string) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return this.syncService.triggerIncrementalSync(businessLine);
  }

  @Get('records')
  getSyncRecords() {
    return this.syncRecordsService.findAll();
  }
}
```

Also create the SyncRecordsService:

```typescript
// apps/sync-service/src/sync/sync-records.service.ts
import { Injectable } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2';
import { syncRecords } from '@app/shared';
import { desc } from 'drizzle-orm';

@Injectable()
export class SyncRecordsService {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const connection = createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });
    this.db = drizzle(connection);
  }

  async findAll() {
    return this.db.select().from(syncRecords).orderBy(desc(syncRecords.createdAt)).limit(50);
  }
}
```

Note: `syncRecords` schema is exported from `@app/shared` (libs/shared). See Task 3 where shared schemas are added.
```

- [ ] **Step 5: Create Sync module**

```typescript
// apps/sync-service/src/sync/sync.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncConsumer } from './sync.consumer';
import { SyncScheduler } from './sync.scheduler';
import { SyncRecordsService } from './sync-records.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SyncController],
  providers: [SyncService, SyncConsumer, SyncScheduler, SyncRecordsService],
})
export class SyncModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/sync-service/src/sync/ package.json
git commit -m "feat: add Sync Service with RabbitMQ consumer and cron scheduler"
```

---

## Task 13: Sync Service - App Module & Main

**Files:**
- Create: `apps/sync-service/src/app.module.ts`
- Create: `apps/sync-service/src/main.ts`

- [ ] **Step 1: Create Sync Service app module**

```typescript
// apps/sync-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SyncModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Create Sync Service main.ts**

```typescript
// apps/sync-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { RABBITMQ_CONFIG } from '@app/shared';

async function bootstrap() {
  // Start as hybrid: HTTP + Microservice
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Connect to RabbitMQ as microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_CONFIG.url],
      queue: 'sync-service-consumer',
      queueOptions: { durable: false },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.SYNC_SERVICE_PORT || 3001;
  await app.listen(port);
  console.log(`Sync Service running on port ${port} (HTTP + RabbitMQ)`);
}
bootstrap();
```

- [ ] **Step 3: Test Sync Service starts**

```bash
npm run start:sync
```

Expected: "Sync Service running on port 3001 (HTTP + RabbitMQ)"

- [ ] **Step 4: Commit**

```bash
git add apps/sync-service/src/app.module.ts apps/sync-service/src/main.ts
git commit -m "feat: add Sync Service app module with hybrid HTTP+RabbitMQ"
```

---

## Task 14: Gateway - Routing & Auth

**Files:**
- Create: `apps/gateway/src/guards/api-key.guard.ts`
- Create: `apps/gateway/src/filters/all-exceptions.filter.ts`
- Create: `apps/gateway/src/proxy/proxy.service.ts`
- Create: `apps/gateway/src/app.controller.ts`
- Create: `apps/gateway/src/app.module.ts`
- Create: `apps/gateway/src/main.ts`
- Create: `apps/gateway/tsconfig.app.json`

- [ ] **Step 1: Create Gateway tsconfig**

```json
// apps/gateway/tsconfig.app.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/gateway"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 2: Create API Key guard**

```typescript
// apps/gateway/src/guards/api-key.guard.ts
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
    const apiKey = request.headers['x-api-key'];
    const businessLine = request.params.businessLine;

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    if (!businessLine || !isValidBusinessLine(businessLine)) {
      return true; // Let the downstream service handle invalid business lines
    }

    const expectedKey = API_KEYS[businessLine];
    if (apiKey !== expectedKey) {
      throw new UnauthorizedException(`Invalid API key for business line: ${businessLine}`);
    }

    return true;
  }
}
```

- [ ] **Step 3: Create global exception filter**

```typescript
// apps/gateway/src/filters/all-exceptions.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message: typeof message === 'string' ? message : (message as any).message || message,
      error: typeof message === 'string' ? message : (message as any).error || 'Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

- [ ] **Step 4: Create Proxy service for routing to downstream services**

```typescript
// apps/gateway/src/proxy/proxy.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios, { Method } from 'axios';

const SERVICE_MAP: Record<string, string> = {
  sync: process.env.SYNC_SERVICE_URL || 'http://localhost:3001',
  search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3002',
  form: process.env.FORM_SERVICE_URL || 'http://localhost:3003',
};

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  async forward(
    service: string,
    method: Method,
    path: string,
    body?: any,
    headers?: Record<string, string>,
  ) {
    const baseUrl = SERVICE_MAP[service];
    if (!baseUrl) {
      throw new Error(`Unknown service: ${service}`);
    }

    const url = `${baseUrl}${path}`;
    this.logger.log(`Proxying ${method} ${path} → ${service}-service`);

    try {
      const response = await axios({
        method,
        url,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        this.logger.error(`Downstream error: ${error.response.status} ${error.response.data?.message}`);
        throw error.response.data;
      }
      this.logger.error(`Proxy error: ${error.message}`);
      throw error;
    }
  }
}
```

Install axios:

```bash
npm install axios
```

- [ ] **Step 5: Create Gateway controller with proxy routing**

```typescript
// apps/gateway/src/app.controller.ts
import { Controller, Get, Post, Patch, Delete, Req, Res, Param, Body, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy/proxy.service';

@Controller()
export class AppController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'gateway', timestamp: new Date().toISOString() };
  }

  // Sync Service routes
  @Post('api/sync/full/:businessLine')
  async syncFull(@Param('businessLine') bl: string, @Req() req: Request) {
    return this.proxyService.forward('sync', 'POST', `/api/sync/full/${bl}`);
  }

  @Post('api/sync/incremental/:businessLine')
  async syncIncremental(@Param('businessLine') bl: string, @Req() req: Request) {
    return this.proxyService.forward('sync', 'POST', `/api/sync/incremental/${bl}`);
  }

  @Get('api/sync/records')
  async syncRecords() {
    return this.proxyService.forward('sync', 'GET', '/api/sync/records');
  }

  // Search Service routes
  @Get('api/search/:businessLine/products')
  async searchProducts(
    @Param('businessLine') bl: string,
    @Query() query: Record<string, string>,
  ) {
    const qs = new URLSearchParams(query).toString();
    return this.proxyService.forward('search', 'GET', `/api/search/${bl}/products?${qs}`);
  }

  @Get('api/search/:businessLine/products/:id')
  async getProduct(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('search', 'GET', `/api/search/${bl}/products/${id}`);
  }

  @Get('api/search/:businessLine/aggregations')
  async getAggregations(@Param('businessLine') bl: string) {
    return this.proxyService.forward('search', 'GET', `/api/search/${bl}/aggregations`);
  }

  // Form Service routes - Schemes
  @Post('api/form/:businessLine/schemes')
  async createScheme(@Param('businessLine') bl: string, @Body() body: any) {
    return this.proxyService.forward('form', 'POST', `/api/form/${bl}/schemes`, body);
  }

  @Get('api/form/:businessLine/schemes')
  async listSchemes(@Param('businessLine') bl: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/schemes`);
  }

  @Get('api/form/:businessLine/schemes/:id')
  async getScheme(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/schemes/${id}`);
  }

  @Patch('api/form/:businessLine/schemes/:id')
  async updateScheme(
    @Param('businessLine') bl: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forward('form', 'PATCH', `/api/form/${bl}/schemes/${id}`, body);
  }

  @Delete('api/form/:businessLine/schemes/:id')
  async deleteScheme(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('form', 'DELETE', `/api/form/${bl}/schemes/${id}`);
  }

  // Form Service routes - Forms
  @Post('api/form/:businessLine/forms')
  async createForm(@Param('businessLine') bl: string, @Body() body: any) {
    return this.proxyService.forward('form', 'POST', `/api/form/${bl}/forms`, body);
  }

  @Get('api/form/:businessLine/forms')
  async listForms(@Param('businessLine') bl: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/forms`);
  }

  @Get('api/form/:businessLine/forms/:id')
  async getForm(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/forms/${id}`);
  }

  @Patch('api/form/:businessLine/forms/:id')
  async updateForm(
    @Param('businessLine') bl: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forward('form', 'PATCH', `/api/form/${bl}/forms/${id}`, body);
  }
}
```

- [ ] **Step 6: Create Gateway app module**

```typescript
// apps/gateway/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { ProxyService } from './proxy/proxy.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [
    ProxyService,
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

- [ ] **Step 7: Create Gateway main.ts**

```typescript
// apps/gateway/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const port = process.env.GATEWAY_PORT || 3000;
  await app.listen(port);
  console.log(`Gateway running on port ${port}`);
}
bootstrap();
```

- [ ] **Step 8: Test Gateway starts**

```bash
npm run start:gateway
```

Expected: "Gateway running on port 3000"

- [ ] **Step 9: Commit**

```bash
git add apps/gateway/
git commit -m "feat: add Gateway with API key auth, proxy routing, and error filter"
```

---

## Task 15: Integration Testing

**Files:** None (verification only)

- [ ] **Step 1: Start all infrastructure**

```bash
docker-compose up -d
```

- [ ] **Step 2: Start all services (in separate terminals)**

```bash
# Terminal 1
npm run start:form

# Terminal 2
npm run start:search

# Terminal 3
npm run start:sync

# Terminal 4
npm run start:gateway
```

- [ ] **Step 3: Test manual sync trigger**

```bash
curl -X POST http://localhost:3000/api/sync/full/ds \
  -H "X-API-Key: ds_key_123"
```

Expected: `{ "status": "queued", "type": "full", "businessLine": "ds" }`

- [ ] **Step 4: Wait for sync to complete, then test search**

```bash
# Wait 2-3 seconds for RabbitMQ to process
curl "http://localhost:3000/api/search/ds/products?keyword=显示器" \
  -H "X-API-Key: ds_key_123"
```

Expected: JSON with search results containing "海信 65 寸 4K 商用显示器"

- [ ] **Step 5: Test aggregations**

```bash
curl "http://localhost:3000/api/search/ds/aggregations" \
  -H "X-API-Key: ds_key_123"
```

Expected: JSON with categories and brands aggregations.

- [ ] **Step 6: Test scheme creation**

```bash
curl -X POST http://localhost:3000/api/form/ds/schemes \
  -H "X-API-Key: ds_key_123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "商显采购方案",
    "description": "2026年Q2商显设备采购",
    "config": { "minQuantity": 10 }
  }'
```

Expected: JSON with created scheme (id: 1)

- [ ] **Step 7: Test form submission**

```bash
curl -X POST http://localhost:3000/api/form/ds/forms \
  -H "X-API-Key: ds_key_123" \
  -H "Content-Type: application/json" \
  -d '{
    "schemeId": 1,
    "productIds": ["P001", "P002"],
    "formData": {
      "customerName": "测试科技有限公司",
      "contact": "张三",
      "phone": "13800138000",
      "items": [
        { "productId": "P001", "quantity": 10, "unitPrice": 4799.00, "subtotal": 47990.00 },
        { "productId": "P002", "quantity": 5, "unitPrice": 3299.00, "subtotal": 16495.00 }
      ],
      "totalAmount": 64485.00,
      "totalQuantity": 15
    }
  }'
```

Expected: JSON with created form (id: 1, totalAmount: "64485.00")

- [ ] **Step 8: Test form listing**

```bash
curl "http://localhost:3000/api/form/ds/forms" \
  -H "X-API-Key: ds_key_123"
```

Expected: Array with the submitted form.

- [ ] **Step 9: Test incremental sync**

```bash
curl -X POST http://localhost:3000/api/sync/incremental/ds \
  -H "X-API-Key: ds_key_123"
```

Expected: `{ "status": "queued", "type": "incremental", "businessLine": "ds" }`

- [ ] **Step 10: Verify ES has updated data**

```bash
# Check ES directly
curl "http://localhost:9200/products_ds/_count"
```

Expected: Count reflecting synced products.

- [ ] **Step 11: Test invalid API key**

```bash
curl http://localhost:3000/api/search/ds/products \
  -H "X-API-Key: wrong_key"
```

Expected: 401 Unauthorized

- [ ] **Step 12: Test invalid business line**

```bash
curl http://localhost:3000/api/search/invalid/products \
  -H "X-API-Key: ds_key_123"
```

Expected: 400 Bad Request

- [ ] **Step 13: Commit final state**

```bash
git add -A
git commit -m "feat: complete nest-search backend service implementation"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Project scaffolding | None |
| 2 | Docker Compose | Task 1 |
| 3 | Shared library | Task 1 |
| 4 | Form Service - DB layer | Task 3 |
| 5 | Form Service - Scheme module | Task 4 |
| 6 | Form Service - Form module | Task 4 |
| 7 | Form Service - App module | Task 5, 6 |
| 8 | Search Service - ES layer | Task 3 |
| 9 | Search Service - Search module | Task 8 |
| 10 | Search Service - App module | Task 9 |
| 11 | Sync Service - Mock data | Task 1 |
| 12 | Sync Service - Sync module | Task 3, 11 |
| 13 | Sync Service - App module | Task 12 |
| 14 | Gateway - Routing & Auth | Task 3 |
| 15 | Integration testing | All tasks |

**Parallelization opportunities:**
- Tasks 4-7 (Form Service) can run in parallel with Tasks 8-10 (Search Service) and Tasks 11-13 (Sync Service)
- Task 14 (Gateway) is independent and can run in parallel
- Task 15 must be last
