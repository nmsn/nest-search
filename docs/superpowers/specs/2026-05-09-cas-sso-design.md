# CAS SSO Design

## Goal

Implement CAS (Central Authentication Service) SSO for the nest-search project, allowing multiple frontend applications (商显、道闸、会议平板) to share a single login session. Users authenticate once and can access all business line frontends without re-logging in.

## Architecture

### Overview

Add a 5th service `auth-service` as the CAS Server. The existing API Key authentication remains for service-to-service calls; CAS handles frontend user authentication.

```
FrontendA(商显)  FrontendB(道闸)  FrontendC(会议)
    ↓                ↓                ↓
  Gateway (port 3000)
    ↓
┌───────────────────────────────────┐
│  API Key Guard (service-to-service)│
│  CAS Guard (user authentication)   │  ← NEW
└───────────────────────────────────┘
    ↓            ↓            ↓
Sync Service  Search Service  Form Service
                  ↓
            Auth Service (port 3004)  ← NEW CAS Server
                  ↓
              MySQL (users, cas_tickets, cas_services)
```

### Authentication Layers

- **API Key**: Service-to-service calls (unchanged)
- **CAS Session/JWT**: Frontend user authentication (new)

### CAS Core Concepts

- **TGT (Ticket Granting Ticket)**: Main ticket issued after login, stored on CAS Server, identified by TGC cookie
- **ST (Service Ticket)**: One-time ticket for accessing a specific service, consumed after use
- **Service Registration**: Business systems register their callback URLs with CAS Server

## Components

### Auth Service (CAS Server)

New service at `apps/auth-service/`:

| Module | Responsibility |
|--------|---------------|
| `auth/` | Login, logout, session management |
| `cas/` | CAS protocol: TGT issuance, ST signing, ticket validation |
| `user/` | User CRUD (registration, lookup) |
| `database/` | Drizzle ORM + MySQL connection |

### CAS Protocol Endpoints

```
GET  /cas/login?service=xxx     → Serve login page
POST /cas/login                 → Validate credentials, issue TGT, redirect with ST
GET  /cas/validate              → Validate ST (CAS 1.0)
POST /cas/serviceValidate       → Validate ST (CAS 2.0/3.0, returns XML)
GET  /cas/logout                → Destroy TGT, redirect to login page
```

### User Endpoints

```
POST /api/auth/register         → Register new user (admin only)
POST /api/auth/login            → Direct API login (returns JWT, same response as validate)
POST /api/auth/logout           → Logout
GET  /api/auth/me               → Get current user info
POST /api/auth/validate         → Validate ST ticket, return JWT (called by frontend after CAS redirect)
```

**`POST /api/auth/register` contract:**

Request:
```json
{ "username": "zhangsan", "password": "pass123", "email": "zhangsan@example.com", "role": "user" }
```
Fields: `username` (required), `password` (required), `email` (optional), `role` (optional, default `'user'`)

Response (201):
```json
{ "id": 2, "username": "zhangsan", "email": "zhangsan@example.com", "role": "user", "status": "active" }
```

**`POST /api/auth/validate` contract:**

Request:
```json
{ "ticket": "ST-xxxxx", "service": "http://ds.example.local/callback" }
```

Response (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "username": "admin", "role": "admin" }
}
```

Response (401):
```json
{ "statusCode": 401, "message": "Invalid or expired service ticket" }
```

Response (403 — disabled user):
```json
{ "statusCode": 403, "message": "User account is disabled" }
```

## Domain Structure

All services share a common parent domain for cookie-based SSO:

```
*.example.local (shared parent domain)
├── auth.example.local    → Auth Service (CAS Server)
├── ds.example.local      → 商显前端
├── zk.example.local      → 道闸前端
├── meeting.example.local → 会议平板前端
└── api.example.local     → Gateway
```

TGC cookie is set on `.example.local` domain, making it readable by all subdomains. In development, use `*.localhost` with different ports or `/etc/hosts` entries.

## CAS Login Flow

### First Login

```
1. Frontend accesses http://ds.example.local/products
2. Frontend checks: no local session → redirect to:
   http://auth.example.local/cas/login?service=http://ds.example.local/callback
3. CAS Server returns login page (username/password form)
4. User submits credentials
5. CAS Server validates → issues TGT (sets TGC cookie on .example.local domain)
   → redirects to http://ds.example.local/callback?ST=ST-xxxxx
6. Frontend receives ST → POST /api/auth/validate { ticket: "ST-xxxxx", service: "..." }
7. Gateway validates ST with CAS Server → valid → returns JWT
8. Frontend stores JWT → accesses business APIs with Authorization header
```

### Cross-System Auto-Login

```
1. User is logged into 商显 system (CAS Server has TGT on .example.local)
2. User visits 道闸 system http://zk.example.local/dashboard
3. Frontend checks: no JWT → redirects to CAS Server
4. CAS Server finds TGC cookie (shared parent domain, user already logged in)
   → auto-issues ST → redirects back to 道闸 system
5. 道闸 system exchanges ST for JWT → user doesn't need to enter password
```

## Gateway Integration

### CasGuard

New guard coexisting with ApiKeyGuard:

- Request has `X-API-Key` → API Key authentication (service-to-service)
- Request has `Authorization: Bearer <token>` → CAS user authentication
- Neither → 401

### Route Protection

- `/api/search/*` — Requires user login
- `/api/form/*` — Requires user login
- `/api/sync/*` — Requires admin role
- `/health` — No auth required

### JWT Configuration

Gateway self-verifies JWTs (no round-trip to auth-service for every request):

- **Secret**: Shared via env var `JWT_SECRET` (same value in auth-service and gateway)
- **Algorithm**: HS256
- **Expiration**: 2 hours (configurable via `JWT_EXPIRES_IN`)
- **Payload**:
```json
{
  "sub": 1,
  "username": "admin",
  "role": "admin",
  "iat": 1715200000,
  "exp": 1715207200
}
```

### CasGuard Implementation

```typescript
// Extract JWT from Authorization: Bearer <token> header
// Verify JWT using JWT_SECRET (self-verification, no auth-service call)
// Parse payload: { sub, username, role }
// Attach { userId, username, role } to request object
// If role check needed (e.g., /api/sync/*), verify role === 'admin'
```

## Database Schema

### users

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  role ENUM('admin', 'user') DEFAULT 'user',
  status ENUM('active', 'disabled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### cas_tickets

```sql
CREATE TABLE cas_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket VARCHAR(255) UNIQUE NOT NULL,
  type ENUM('TGT', 'ST') NOT NULL,
  user_id INT NOT NULL,
  service VARCHAR(500),
  expires_at TIMESTAMP NOT NULL,
  consumed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### cas_services

```sql
CREATE TABLE cas_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id VARCHAR(100) UNIQUE NOT NULL,
  service_url VARCHAR(500) NOT NULL,
  name VARCHAR(100),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Project Structure

### New Files

```
apps/auth-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── database/
│   │   ├── drizzle.module.ts
│   │   ├── drizzle.service.ts
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── cas-tickets.ts
│   │       └── cas-services.ts
│   ├── user/
│   │   ├── user.module.ts
│   │   ├── user.service.ts
│   │   └── dto/
│   ├── cas/
│   │   ├── cas.module.ts
│   │   ├── cas.controller.ts
│   │   ├── cas.service.ts
│   │   └── cas.guard.ts
│   └── auth/
│       ├── auth.module.ts
│       ├── auth.controller.ts
│       └── auth.service.ts
```

### Modified Files

- `apps/gateway/src/guards/cas.guard.ts` — NEW CasGuard
- `apps/gateway/src/app.module.ts` — Register CasGuard
- `apps/gateway/src/app.controller.ts` — Add route protection
- `libs/shared/src/constants/cas.ts` — CAS config constants
- `libs/shared/src/interfaces/user.interface.ts` — User interface
- `nest-cli.json` — Add auth-service project

## Error Handling

- Invalid credentials → 401 with error message
- Expired TGT → redirect to login page
- Invalid/expired ST → 400 with error message
- Disabled user → 403 with error message
- Service not registered → 400 with error message

## Security Considerations

- Passwords hashed with bcrypt (salt rounds: 10)
- TGT expires after 8 hours
- ST expires after 30 seconds (one-time use, generous for slow networks)
- TGC cookie is HttpOnly, Secure (in production), domain: `.example.local`
- JWT secret stored in `.env` (not in code)
- cas_services seeded via migration (pre-register all business line frontends)
- CSRF protection on login form
- Rate limiting on login endpoint (5 attempts per minute)
- Admin role check is simple `role === 'admin'` — no complex permission model
