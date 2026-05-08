# nest-search: IoT Product Warehouse Backend Service

## Overview

A backend service for IoT product warehouse management, designed as a learning project for frontend developers to understand backend business flows. The system syncs product data from remote sources into Elasticsearch, enables search and configuration through the frontend, and stores finalized form submissions in MySQL.

**Architecture:** Microservices + CQRS (read/write service separation)

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
  product_ids   JSON NOT NULL,                    -- ES product ID list
  total_amount  DECIMAL(12, 2) NOT NULL,
  total_quantity INT NOT NULL,
  status        ENUM('draft', 'submitted', 'approved') DEFAULT 'draft',
  form_data     JSON NOT NULL,                    -- Complete form data
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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

```typescript
export function createSchemesTable(prefix: string) {
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

## RabbitMQ Design

### Exchanges and Queues

```
Exchanges:
  sync.exchange (topic)
    ├── sync.full.{businessLine}        # Full sync
    └── sync.incremental.{businessLine} # Incremental sync

  event.exchange (fanout)
    └── form.submitted                  # Form submission event

Queues:
  sync.full.queue              → Sync Service Consumer
  sync.incremental.queue       → Sync Service Consumer
  event.form.submitted.queue   → optional: other service listeners
```

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

### Gateway

All requests routed through Gateway with `X-Business-Line` header.

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
