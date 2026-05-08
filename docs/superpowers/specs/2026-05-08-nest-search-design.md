# nest-search: IoT Product Warehouse Backend Service

## Overview

A backend service for IoT product warehouse management, designed as a learning project for frontend developers to understand backend business flows. The system syncs product data from remote sources into Elasticsearch, enables search and configuration through the frontend, and stores finalized form submissions in MySQL.

**Architecture:** Microservices + CQRS (read/write service separation)

## Non-Goals (Out of Scope)

- Real remote API integration (using local JSON mock data)
- User authentication system (using static API keys per business line)
- Production deployment configuration
- Real-time data streaming

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | NestJS | latest (v10+) |
| Database | MySQL | 8.0 |
| ORM | Drizzle ORM | latest |
| Search Engine | Elasticsearch | 8.12 + IK Analyzer |
| Message Queue | RabbitMQ | 3.x (management) |
| Scheduler | @nestjs/schedule | - |
| Containerization | Docker Compose | 3.8 |
| Monorepo | NestJS CLI monorepo | - |

## Architecture

### Services

```
                        ┌──────────────┐
                        │   Gateway    │  ← API routing + auth
                        │  (NestJS)    │
                        └──────┬───────┘
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Sync    │   │  Search  │   │  Form    │
        │ Service  │   │ Service  │   │ Service  │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
             ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ RabbitMQ │   │   ES     │   │  MySQL   │
        └──────────┘   └──────────┘   └──────────┘
```

| Service | Responsibility | Data Store |
|---------|---------------|------------|
| **Gateway** | Route requests, identify business line, auth | Stateless |
| **Sync Service** | Scheduled data sync from remote sources → ES | ES |
| **Search Service** | ES query API: full-text search, filter, aggregation | ES (read-only) |
| **Form Service** | Scheme configuration + form CRUD, submit summary data | MySQL |

### Authentication Strategy

For this learning project, we use **static API keys** per business line:

- Each business line has a unique API key (e.g., `ds_key_123`, `zk_key_456`)
- Gateway middleware validates `X-API-Key` header against registered keys
- No user authentication (out of scope for learning backend flows)
- Keys stored in environment variables, not in code

```typescript
// Gateway middleware: api-key.guard.ts
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const businessLine = request.params.businessLine;
    return validateApiKey(businessLine, apiKey);
  }
}
```

### CQRS Mapping

- **Command side:** Sync Service (write ES), Form Service (write MySQL)
- **Query side:** Search Service (read ES), Form Service query endpoints (read MySQL)
- Read/write isolation through service boundaries

## Data Flow

### 1. Sync Flow (Scheduled)

```
Cron → Sync Service → call remote API (mock: read local JSON)
     → publish message to RabbitMQ
     → Consumer batch-write to ES
```

- Daily at 02:00: incremental sync
- Weekly on Sunday at 03:00: full sync
- Manual trigger via API also supported

### 2. Search Flow

```
Frontend → Gateway → Search Service → ES full-text search/filter
```

### 3. Scheme Configuration Flow

```
Frontend → Gateway → Form Service → MySQL scheme CRUD
```

### 4. Form Submission Flow

```
Frontend → Gateway → Form Service → validate + calculate amounts
         → MySQL store form
         → publish event to RabbitMQ (optional: notify other services)
```

## Project Structure

```
nest-search/
├── apps/
│   ├── gateway/                    # API Gateway
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   ├── middleware/         # Business line identification
│   │   │   └── guards/
│   │   └── Dockerfile
│   │
│   ├── sync-service/               # Data Sync Service
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   ├── sync/
│   │   │   │   ├── sync.controller.ts    # Manual trigger endpoints
│   │   │   │   ├── sync.service.ts       # Sync logic
│   │   │   │   ├── sync.scheduler.ts     # Cron jobs
│   │   │   │   └── sync.consumer.ts      # RabbitMQ Consumer
│   │   │   └── mock/               # Local JSON mock data
│   │   └── Dockerfile
│   │
│   ├── search-service/             # ES Query Service
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   ├── search/
│   │   │   │   ├── search.controller.ts
│   │   │   │   ├── search.service.ts
│   │   │   │   └── search.queries.ts     # ES query builders
│   │   │   └── index/              # ES Index management
│   │   └── Dockerfile
│   │
│   └── form-service/               # Form Service
│       ├── src/
│       │   ├── app.module.ts
│       │   ├── main.ts
│       │   ├── scheme/
│       │   │   ├── scheme.controller.ts
│       │   │   ├── scheme.service.ts
│       │   │   └── scheme.entity.ts
│       │   ├── form/
│       │   │   ├── form.controller.ts
│       │   │   ├── form.service.ts
│       │   │   └── form.entity.ts
│       │   └── database/
│       │       ├── drizzle/        # Drizzle schema + migrations
│       │       └── drizzle.module.ts
│       └── Dockerfile
│
├── libs/                           # Shared library
│   └── shared/
│       ├── dto/                    # Shared DTOs
│       ├── interfaces/             # Shared interfaces
│       ├── constants/              # Constants (business line enum, etc.)
│       └── rabbitmq/               # RabbitMQ configuration
│
├── data/                           # Mock data
│   ├── products-full.json          # Full product data
│   └── products-incremental.json   # Incremental product data
│
├── docker-compose.yml
├── package.json
├── nest-cli.json                   # NestJS Monorepo config
└── tsconfig.json
```

## Database Design (MySQL + Drizzle)

### Business Line Isolation

Table prefix pattern: `{business_line}_{table_name}` (e.g., `ds_schemes`, `zk_forms`)

### Schema

```sql
-- Global: business line registry
CREATE TABLE business_lines (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  code         VARCHAR(50) UNIQUE NOT NULL,     -- 'ds', 'zk', 'meeting'
  name         VARCHAR(100) NOT NULL,
  table_prefix VARCHAR(20) UNIQUE NOT NULL,     -- 'ds_', 'zk_', 'mt_'
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Per business line (example: ds_ for digital signage)

CREATE TABLE ds_schemes (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  status      ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  config      JSON,                              -- Scheme config (product filters, etc.)
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE ds_forms (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  scheme_id     INT NOT NULL,
  product_ids   JSON NOT NULL,                    -- ES product ID list (source of truth for product references)
  total_amount  DECIMAL(12, 2) NOT NULL,
  total_quantity INT NOT NULL,
  status        ENUM('draft', 'submitted', 'approved') DEFAULT 'draft',
  form_data     JSON NOT NULL,                    -- Complete form data (snapshot at submission time)
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (scheme_id) REFERENCES ds_schemes(id) ON DELETE RESTRICT
);

-- Note: product_ids stores ES product IDs as the source of truth.
-- form_data stores a snapshot of product details at submission time.
-- If products are deleted from ES, the form still retains the snapshot data.
-- This design separates product references (ES) from form snapshots (MySQL).

-- Global: sync task records
CREATE TABLE sync_records (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  type           ENUM('incremental', 'full') NOT NULL,
  status         ENUM('pending', 'running', 'success', 'failed') DEFAULT 'pending',
  records_count  INT DEFAULT 0,
  error_message  TEXT,
  started_at     TIMESTAMP,
  completed_at   TIMESTAMP,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Drizzle Dynamic Table Prefix

**Challenge:** Drizzle needs static schema references for type-safe queries, but we need dynamic table names per business line.

**Solution:** Pre-register all business line tables at startup, use factory pattern to get the correct table reference.

```typescript
// form-service/src/database/drizzle/schema-factory.ts
import { mysqlTable, int, varchar, text, json, decimal, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

// Table definition factory
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

// Pre-registered tables for all business lines
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

// Type-safe accessor
export function getBusinessLineTables(businessLine: string) {
  const tables = TABLES[businessLine as keyof typeof TABLES];
  if (!tables) throw new Error(`Unknown business line: ${businessLine}`);
  return tables;
}
```

**Usage in Service:**

```typescript
// form-service/src/scheme/scheme.service.ts
@Injectable()
export class SchemeService {
  constructor(private drizzle: DrizzleService) {}

  async create(businessLine: string, data: CreateSchemeDto) {
    const tables = getBusinessLineTables(businessLine);
    return this.drizzle.db.insert(tables.schemes).values(data).returning();
  }

  async findAll(businessLine: string) {
    const tables = getBusinessLineTables(businessLine);
    return this.drizzle.db.select().from(tables.schemes);
  }
}
```

**Migrations:** Use Drizzle Kit with a custom migration script that generates per-business-line tables. Run once at startup or via CLI.

```typescript
// scripts/migrate.ts
import { TABLES } from '../form-service/src/database/drizzle/schema-factory';
import { drizzle } from 'drizzle-orm/mysql2';

async function migrate() {
  const db = drizzle(process.env.DATABASE_URL);
  for (const [bl, tables] of Object.entries(TABLES)) {
    // Tables are created via Drizzle Kit push or SQL migration files
    // This script ensures they exist at startup
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${bl}_schemes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
        config JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${bl}_forms (
        id INT PRIMARY KEY AUTO_INCREMENT,
        scheme_id INT NOT NULL,
        product_ids JSON NOT NULL,
        total_amount DECIMAL(12, 2) NOT NULL,
        total_quantity INT NOT NULL,
        status ENUM('draft', 'submitted', 'approved') DEFAULT 'draft',
        form_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (scheme_id) REFERENCES ${bl}_schemes(id) ON DELETE RESTRICT
      )
    `);
  }
}
```

## Elasticsearch Index Design

Per-business-line indices: `products_ds`, `products_zk`, `products_meeting`

```json
{
  "mappings": {
    "properties": {
      "productId":    { "type": "keyword" },
      "name":         { "type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart" },
      "category":     { "type": "keyword" },
      "brand":        { "type": "keyword" },
      "model":        { "type": "keyword" },
      "spec":         { "type": "text" },
      "price":        { "type": "float" },
      "unit":         { "type": "keyword" },
      "stock":        { "type": "integer" },
      "imageUrl":     { "type": "keyword", "index": false },
      "attributes":   { "type": "object", "enabled": false },
      "syncedAt":     { "type": "date" },
      "businessLine": { "type": "keyword" }
    }
  }
}
```

- `name`: IK analyzer for Chinese full-text search
- `attributes`: stored but not indexed (reduces memory)
- Per-business-line index isolation

**ES Index Initialization:**
- Search Service creates indices on startup if they don't exist
- Uses `esClient.indices.exists()` check before `esClient.indices.create()`
- Mapping defined in code, not in external files

## RabbitMQ Design

### Exchanges and Queues

```
Exchanges:
  sync.exchange (topic)
    ├── sync.full.ds            # Full sync for 商显
    ├── sync.full.zk            # Full sync for 道闸
    ├── sync.full.meeting       # Full sync for 会议平板
    ├── sync.incremental.ds     # Incremental sync for 商显
    ├── sync.incremental.zk     # Incremental sync for 道闸
    └── sync.incremental.meeting # Incremental sync for 会议平板

  event.exchange (fanout)
    └── form.submitted          # Form submission event

Queues (per business line):
  sync.full.ds.queue           → Sync Service Consumer
  sync.full.zk.queue           → Sync Service Consumer
  sync.full.meeting.queue      → Sync Service Consumer
  sync.incremental.ds.queue    → Sync Service Consumer
  sync.incremental.zk.queue    → Sync Service Consumer
  sync.incremental.meeting.queue → Sync Service Consumer
  event.form.submitted.queue   → optional: other service listeners
```

**Routing Logic:**
- Producer publishes to `sync.exchange` with routing key `sync.full.{businessLine}`
- Each business line has its own queue, bound with specific routing key
- Consumer processes messages independently per business line
- No message competition between business lines

### Message Formats

```typescript
interface SyncFullMessage {
  businessLine: string;
  triggeredBy: 'cron' | 'manual';
  timestamp: Date;
}

interface SyncIncrementalMessage {
  businessLine: string;
  lastSyncTime: Date;
  triggeredBy: 'cron' | 'manual';
  timestamp: Date;
}

interface FormSubmittedEvent {
  formId: number;
  businessLine: string;
  schemeId: number;
  totalAmount: number;
  timestamp: Date;
}
```

### Sync Schedule

- Daily 02:00: incremental sync (Cron: `0 2 * * *`)
- Weekly Sunday 03:00: full sync (Cron: `0 3 * * 0`)
- Manual trigger via API also supported
- Retry: RabbitMQ `nack` + `requeue`, max 3 attempts

## API Design

### Standard Error Response

All error responses follow this format:

```typescript
interface ErrorResponse {
  statusCode: number;        // HTTP status code
  message: string;           // Human-readable error message
  error: string;             // Error type (e.g., 'Bad Request', 'Not Found')
  timestamp: string;         // ISO 8601 timestamp
  path: string;              // Request path
}

// Example: 400 Bad Request
{
  "statusCode": 400,
  "message": "Invalid business line: invalid_code",
  "error": "Bad Request",
  "timestamp": "2026-05-08T10:30:00.000Z",
  "path": "/api/search/invalid_code/products"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error)
- `401`: Unauthorized (invalid API key)
- `404`: Not Found
- `500`: Internal Server Error

### DTO Validation

All DTOs use `class-validator` decorators for automatic request validation:

```typescript
// form-service/src/scheme/dto/create-scheme.dto.ts
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
```

NestJS `ValidationPipe` automatically validates incoming requests against DTO decorators.

### Gateway

All requests routed through Gateway. Business line is identified from URL path param `{businessLine}` (authoritative). `X-API-Key` header is required for authentication.

### Sync Service

```
POST   /api/sync/full/{businessLine}          # Trigger full sync
POST   /api/sync/incremental/{businessLine}   # Trigger incremental sync
GET    /api/sync/records                       # View sync records
```

### Search Service

```
GET    /api/search/{businessLine}/products     # Search products
GET    /api/search/{businessLine}/products/:id # Product detail
GET    /api/search/{businessLine}/aggregations # Aggregations (category, brand)
```

### Form Service

```
# Schemes
POST   /api/form/{businessLine}/schemes        # Create scheme
GET    /api/form/{businessLine}/schemes        # List schemes
GET    /api/form/{businessLine}/schemes/:id    # Scheme detail
PATCH  /api/form/{businessLine}/schemes/:id    # Update scheme
DELETE /api/form/{businessLine}/schemes/:id    # Delete scheme

# Forms
POST   /api/form/{businessLine}/forms          # Submit form
GET    /api/form/{businessLine}/forms          # List forms
GET    /api/form/{businessLine}/forms/:id      # Form detail
PATCH  /api/form/{businessLine}/forms/:id      # Update form status
```

### Example: Search Products

```
GET /api/search/ds/products?keyword=显示器&category=商显&brand=海信&page=1&size=20

Response:
{
  "total": 156,
  "page": 1,
  "size": 20,
  "items": [
    {
      "productId": "P001",
      "name": "海信 65 寸 4K 商用显示器",
      "category": "商显",
      "brand": "海信",
      "model": "H65E3A",
      "price": 4999.00,
      "stock": 50
    }
  ]
}
```

### Example: Submit Form

```
POST /api/form/ds/forms
{
  "schemeId": 1,
  "productIds": ["P001", "P002", "P003"],
  "formData": {
    "customerName": "XX 科技有限公司",
    "contact": "张三",
    "phone": "13800138000",
    "items": [
      { "productId": "P001", "quantity": 10, "unitPrice": 4999.00, "subtotal": 49990.00 }
    ],
    "totalAmount": 49990.00,
    "totalQuantity": 10
  }
}
```

## Docker Compose

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: nest_search
    volumes:
      - mysql_data:/var/lib/mysql

  elasticsearch:
    image: elasticsearch:8.12.0
    ports:
      - "9200:9200"
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - es_data:/usr/share/elasticsearch/data

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  mysql_data:
  es_data:
  rabbitmq_data:
```

**Note:** Docker Compose only defines infrastructure services. NestJS applications run locally during development (`nest start:dev`). For production, add app services to docker-compose with proper Dockerfiles.

## Business Lines

| Code | Name | Table Prefix | ES Index |
|------|------|-------------|----------|
| ds | 商显 (Digital Signage) | ds_ | products_ds |
| zk | 道闸 (Barrier Gate) | zk_ | products_zk |
| meeting | 会议平板 (Meeting Tablet) | mt_ | products_meeting |

## Success Criteria

1. `docker-compose up` starts MySQL, ES, RabbitMQ successfully
2. Sync Service consumes mock JSON data and writes to ES
3. Search Service returns search results from ES
4. Form Service creates schemes and submits forms to MySQL
5. Scheduled cron triggers daily incremental and weekly full sync
6. All services communicate through RabbitMQ for async operations
