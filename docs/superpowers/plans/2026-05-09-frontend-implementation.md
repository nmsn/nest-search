# Frontend Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 4 TanStack Start frontend apps (auth-frontend + 3 business line frontends) with dual-token CAS SSO authentication, integrated with the existing NestJS backend.

**Architecture:** pnpm monorepo with a shared frontend library (`frontend-shared`) containing the API client with auto-refresh and auth token management. Each frontend is an independent TanStack Start app with its own port and subdomain. The auth-frontend handles login and issues tokens; business line frontends consume tokens via CAS callback redirect. All 3 business line frontends share identical page structure — only the `BUSINESS_LINE` constant differs.

**Tech Stack:** TanStack Start, TanStack Router (file-based), TanStack Query, Tailwind CSS v4, shadcn/ui (Radix UI), pnpm workspaces, Vite 6, React 19

---

## Phase 1: Backend Auth Service — Dual Token + Redis

The current auth-service uses a single JWT. The frontend spec requires dual-token (access + refresh) with Redis for cross-system logout. This phase modifies the backend before any frontend work.

### Task 1: Add Redis and Dual Token to Auth Service

**Files:**
- Modify: `package.json` (add `ioredis` dependency)
- Modify: `.env` (add `REDIS_HOST`, `REDIS_PORT`, `REFRESH_TOKEN_EXPIRES_IN`)
- Create: `apps/auth-service/src/redis/redis.service.ts`
- Create: `apps/auth-service/src/redis/redis.module.ts`
- Modify: `apps/auth-service/src/auth/auth.service.ts`
- Modify: `apps/auth-service/src/auth/auth.controller.ts`
- Modify: `apps/auth-service/src/auth/auth.module.ts`
- Modify: `apps/auth-service/src/app.module.ts`

**Step 1: Install ioredis**

Run: `pnpm add ioredis`
Expected: ioredis added to package.json dependencies

**Step 2: Update .env with Redis config**

Add to `.env`:
```
REDIS_HOST=localhost
REDIS_PORT=6379
REFRESH_TOKEN_EXPIRES_IN=604800
```

**Step 3: Create RedisService**

Create `apps/auth-service/src/redis/redis.service.ts`:
```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
```

Create `apps/auth-service/src/redis/redis.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

**Step 4: Modify AuthService for dual token**

Replace `apps/auth-service/src/auth/auth.service.ts` with dual-token logic:
- `login()`: returns `{ accessToken, user }`, stores refresh token metadata in Redis, sets refresh token in httpOnly cookie
- `refresh()`: validates refresh token from Redis, rotates tokens, returns new access token
- `logout()`: blacklists refresh token in Redis, deletes from whitelist
- Refresh token is a random UUID stored in Redis with key `refresh_token:{tokenId}`

**Step 5: Modify AuthController for new endpoints**

Update `apps/auth-service/src/auth/auth.controller.ts`:
- `POST /api/auth/login`: returns `{ accessToken, user }` + sets `refreshToken` cookie
- `POST /api/auth/refresh`: reads `refreshToken` cookie, rotates, returns `{ accessToken }`
- `POST /api/auth/logout`: blacklists refresh token, clears cookie

Cookie attributes: `Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
Domain: `process.env.CAS_COOKIE_DOMAIN || '.localhost'`
Secure: `process.env.NODE_ENV === 'production'`

**Step 6: Register RedisModule in AppModule**

Modify `apps/auth-service/src/app.module.ts` to import `RedisModule`.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth-service): add Redis and dual token support"
```

---

## Phase 2: Frontend — Monorepo Setup

### Task 2: Configure pnpm Workspaces

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (add `packageManager` field)

**Step 1: Create pnpm-workspace.yaml**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'libs/*'
```

**Step 2: Update root package.json**

Add to root `package.json`:
```json
{
  "packageManager": "pnpm@9.15.0"
}
```

Do NOT change existing scripts — the NestJS backend still uses npm. The pnpm workspace is only for the frontend apps.

**Step 3: Verify workspace**

Run: `pnpm install`
Expected: pnpm creates `pnpm-lock.yaml`, resolves workspace packages

**Step 4: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "chore: add pnpm workspace configuration"
```

---

### Task 3: Set up Tailwind CSS v4 + shadcn/ui

**Files:**
- Modify: `apps/auth-frontend/vite.config.ts` (add Tailwind plugin)
- Modify: `apps/ds-frontend/vite.config.ts`
- Modify: `apps/zk-frontend/vite.config.ts`
- Modify: `apps/meeting-frontend/vite.config.ts`
- Create: `apps/*/app/styles/app.css` (Tailwind entry for each app)
- Modify: `apps/*/app/routes/__root.tsx` (import CSS)
- Create: `apps/*/components.json` (shadcn config)
- Create: `apps/*/app/lib/utils.ts` (cn helper)
- Create: `apps/*/components/ui/` (shadcn components)

**Step 1: Install Tailwind in each frontend app**

Run in each app directory (auth-frontend, ds-frontend, zk-frontend, meeting-frontend):
```bash
cd apps/<app-name>
pnpm add tailwindcss @tailwindcss/vite
```

**Step 2: Update vite.config.ts to add Tailwind plugin**

In each app's `vite.config.ts`, add the Tailwind plugin:
```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths()],
  server: {
    port: 3100, // 3101, 3102, 3103 for business apps
  },
});
```

**Step 3: Create CSS entry file**

In each app, create `app/styles/app.css`:
```css
@import "tailwindcss";
```

**Step 4: Import CSS in root layout**

In each app's `__root.tsx`, add at the top:
```typescript
import '~/styles/app.css';
```

**Step 5: Initialize shadcn/ui in each app**

Run in each app directory:
```bash
pnpm dlx shadcn@latest init
```

Select: Style: New York, Base color: Slate, CSS variables: yes

**Step 6: Add shadcn/ui components**

Run in each app:
```bash
pnpm dlx shadcn@latest add button input label card table badge dialog select skeleton
```

**Step 7: Verify Tailwind works**

Run: `pnpm --filter @nest-search/auth-frontend dev`
Open `http://auth.localhost:3100` — verify styles render correctly.

**Step 8: Commit**

```bash
git add apps/
git commit -m "feat: add Tailwind CSS v4 and shadcn/ui to all frontends"
```

---

### Task 4: Create Shared Frontend Library (frontend-shared)

**Files:**
- Create: `libs/frontend-shared/package.json`
- Create: `libs/frontend-shared/tsconfig.json`
- Create: `libs/frontend-shared/src/index.ts`
- Create: `libs/frontend-shared/src/api-client.ts`
- Create: `libs/frontend-shared/src/auth.ts`
- Create: `libs/frontend-shared/src/types.ts`
- Create: `libs/frontend-shared/src/hooks/use-auth.ts`
- Create: `libs/frontend-shared/src/hooks/use-api.ts`

> **Design note:** The shared lib provides generic `useApiQuery`/`useApiMutation` hooks and auth infrastructure. Resource-specific hooks (`useProducts`, `useSchemes`, `useForms`) live in each frontend's `app/hooks/` directory, since each business line may have different query parameters.

**Step 1: Create package.json**

Create `libs/frontend-shared/package.json`:
```json
{
  "name": "@nest-search/frontend-shared",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `libs/frontend-shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Create types.ts**

Create `libs/frontend-shared/src/types.ts`:
```typescript
export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
}
```

**Step 4: Create auth.ts — Token management**

Create `libs/frontend-shared/src/auth.ts`:
```typescript
const ACCESS_TOKEN_KEY = 'nest_access_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function parseJwt(token: string): { sub: number; username: string; role: string; exp: number } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload) return true;
  return Date.now() >= payload.exp * 1000;
}
```

**Step 5: Create api-client.ts — Fetch wrapper with auto-refresh**

Create `libs/frontend-shared/src/api-client.ts`:
```typescript
import { getAccessToken, setAccessToken, clearAccessToken } from './auth';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3000';

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${GATEWAY_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = await res.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${GATEWAY_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } else {
      clearAccessToken();
      window.location.href = `/auth-callback?reason=session_expired`;
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw error;
  }

  return res.json();
}
```

**Step 6: Create use-auth.ts — Auth context hook**

Create `libs/frontend-shared/src/hooks/use-auth.ts`:
```typescript
import { createContext, useContext } from 'react';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

**Step 7: Create use-api.ts — TanStack Query wrapper**

Create `libs/frontend-shared/src/hooks/use-api.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export function useApiQuery<T>(key: string[], path: string) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path),
  });
}

export function useApiMutation<T, B = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  invalidateKeys?: string[][],
) {
  const queryClient = useQueryClient();
  return useMutation<T, Error, B>({
    mutationFn: (body: B) =>
      apiFetch<T>(path, {
        method,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      if (invalidateKeys) {
        invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }
    },
  });
}
```

**Step 8: Create barrel export**

Create `libs/frontend-shared/src/index.ts`:
```typescript
export * from './types';
export * from './auth';
export * from './api-client';
export * from './hooks/use-auth';
export * from './hooks/use-api';
```

**Step 9: Commit**

```bash
git add libs/frontend-shared/
git commit -m "feat: add frontend-shared library with auth and API client"
```

---

## Phase 3: Auth Frontend

### Task 5: Scaffold auth-frontend with TanStack Start

**Files:**
- Create: `apps/auth-frontend/package.json`
- Create: `apps/auth-frontend/tsconfig.json`
- Create: `apps/auth-frontend/vite.config.ts`
- Create: `apps/auth-frontend/app.config.ts`
- Create: `apps/auth-frontend/app/routes/__root.tsx`
- Create: `apps/auth-frontend/app/routes/index.tsx`
- Create: `apps/auth-frontend/app/routes/cas/login.tsx`
- Create: `apps/auth-frontend/app/routes/auth-callback.tsx`
- Create: `apps/auth-frontend/app/components/login-form.tsx`
- Create: `apps/auth-frontend/app/router.tsx`
- Create: `apps/auth-frontend/app/ssr.tsx`

**Step 1: Create package.json**

Create `apps/auth-frontend/package.json`:
```json
{
  "name": "@nest-search/auth-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "vite start"
  },
  "dependencies": {
    "@nest-search/frontend-shared": "workspace:*",
    "@tanstack/react-query": "^5.60.0",
    "@tanstack/react-router": "^1.90.0",
    "@tanstack/start": "^1.90.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vinxi": "^0.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vite-tsconfig-paths": "^4.3.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `apps/auth-frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "~/*": ["./app/*"]
    }
  },
  "include": ["app", "app.config.ts"]
}
```

**Step 3: Create vite.config.ts**

Create `apps/auth-frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths()],
  server: {
    port: 3100,
  },
});
```

**Step 4: Create app.config.ts**

Create `apps/auth-frontend/app.config.ts`:
```typescript
import { defineConfig } from '@tanstack/start/config';

export default defineConfig({
  server: {
    port: 3100,
  },
});
```

**Step 5: Create __root.tsx — Root layout**

Create `apps/auth-frontend/app/routes/__root.tsx`:
```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '~/styles/app.css';

const queryClient = new QueryClient();

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <Outlet />
      </div>
    </QueryClientProvider>
  );
}
```

**Step 6: Create index.tsx — Redirect to login**

Create `apps/auth-frontend/app/routes/index.tsx`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/cas/login' });
  },
});
```

**Step 7: Create login page with form**

Create `apps/auth-frontend/app/components/login-form.tsx`:
```tsx
import { useState } from 'react';
import { useRouter, useSearch } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const search = useSearch({ from: '/cas/login' });

  const service = (search as { service?: string }).service || '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || '登录失败');
      }

      const { accessToken } = await res.json();

      if (service) {
        const url = new URL(service);
        url.hash = `access_token=${accessToken}`;
        window.location.href = url.toString();
      } else {
        localStorage.setItem('nest_access_token', accessToken);
        router.navigate({ to: '/' });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-center">CAS 单点登录</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

Create `apps/auth-frontend/app/routes/cas/login.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { LoginForm } from '~/components/login-form';

export const Route = createFileRoute('/cas/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    service: search.service as string | undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <LoginForm />
    </div>
  );
}
```

**Step 8: Create auth-callback route**

Create `apps/auth-frontend/app/routes/auth-callback.tsx`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/auth-callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    service: search.service as string | undefined,
    reason: search.reason as string | undefined,
  }),
  beforeLoad: ({ search }) => {
    const service = (search as { service?: string }).service;
    if (service) {
      throw redirect({ to: '/cas/login', search: { service } });
    }
    throw redirect({ to: '/cas/login' });
  },
});
```

**Step 9: Create router.tsx and ssr.tsx**

Create `apps/auth-frontend/app/router.tsx`:
```typescript
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

Create `apps/auth-frontend/app/ssr.tsx`:
```typescript
import { createStartHandler, defaultStreamHandler } from '@tanstack/start/server';
import { createRouter } from './router';

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);
```

**Step 10: Install dependencies and verify build**

Run: `cd apps/auth-frontend && pnpm install`
Run: `pnpm --filter @nest-search/auth-frontend build`
Expected: Build succeeds

**Step 11: Commit**

```bash
git add apps/auth-frontend/
git commit -m "feat: scaffold auth-frontend with TanStack Start"
```

---

## Phase 4: Business Line Frontend

### Task 6: Scaffold ds-frontend (template for all 3)

**Files:**
- Create: `apps/ds-frontend/package.json`
- Create: `apps/ds-frontend/tsconfig.json`
- Create: `apps/ds-frontend/vite.config.ts`
- Create: `apps/ds-frontend/app.config.ts`
- Create: `apps/ds-frontend/app/routes/__root.tsx`
- Create: `apps/ds-frontend/app/routes/index.tsx`
- Create: `apps/ds-frontend/app/routes/_authenticated.tsx`
- Create: `apps/ds-frontend/app/routes/_authenticated/products.tsx`
- Create: `apps/ds-frontend/app/routes/_authenticated/schemes.tsx`
- Create: `apps/ds-frontend/app/routes/_authenticated/schemes.$id.tsx`
- Create: `apps/ds-frontend/app/routes/_authenticated/forms.tsx`
- Create: `apps/ds-frontend/app/routes/_authenticated/forms.$id.tsx`
- Create: `apps/ds-frontend/app/routes/auth-callback.tsx`
- Create: `apps/ds-frontend/app/components/layout/sidebar.tsx`
- Create: `apps/ds-frontend/app/components/layout/header.tsx`
- Create: `apps/ds-frontend/app/components/auth/auth-provider.tsx`
- Create: `apps/ds-frontend/app/components/products/product-search.tsx`
- Create: `apps/ds-frontend/app/components/products/product-list.tsx`
- Create: `apps/ds-frontend/app/components/schemes/scheme-list.tsx`
- Create: `apps/ds-frontend/app/components/schemes/scheme-form.tsx`
- Create: `apps/ds-frontend/app/components/forms/form-list.tsx`
- Create: `apps/ds-frontend/app/components/forms/form-detail.tsx`
- Create: `apps/ds-frontend/app/components/ui/skeleton.tsx` (from shadcn)
- Create: `apps/ds-frontend/app/hooks/use-products.ts`
- Create: `apps/ds-frontend/app/hooks/use-schemes.ts`
- Create: `apps/ds-frontend/app/hooks/use-forms.ts`
- Create: `apps/ds-frontend/app/lib/api.ts`
- Create: `apps/ds-frontend/app/lib/auth.ts`
- Create: `apps/ds-frontend/app/lib/business-line.ts`
- Create: `apps/ds-frontend/app/router.tsx`
- Create: `apps/ds-frontend/app/ssr.tsx`

**Step 1: Create package.json**

Create `apps/ds-frontend/package.json`:
```json
{
  "name": "@nest-search/ds-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "vite start"
  },
  "dependencies": {
    "@nest-search/frontend-shared": "workspace:*",
    "@tanstack/react-query": "^5.60.0",
    "@tanstack/react-router": "^1.90.0",
    "@tanstack/start": "^1.90.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vinxi": "^0.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vite-tsconfig-paths": "^4.3.0"
  }
}
```

**Step 2: Create config files**

Create `apps/ds-frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "~/*": ["./app/*"]
    }
  },
  "include": ["app", "app.config.ts"]
}
```

Create `apps/ds-frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths()],
  server: {
    port: 3101,
  },
});
```

Create `apps/ds-frontend/app.config.ts`:
```typescript
import { defineConfig } from '@tanstack/start/config';

export default defineConfig({
  server: {
    port: 3101,
  },
});
```

**Step 3: Create business-line.ts**

Create `apps/ds-frontend/app/lib/business-line.ts`:
```typescript
export const BUSINESS_LINE = 'ds' as const;

export function withBusinessLine(path: string): string {
  return path.replace(':businessLine', BUSINESS_LINE);
}
```

This file is the ONLY difference between the 3 business line frontends. Each has its own `BUSINESS_LINE` value (`ds`, `zk`, `meeting`).

**Step 4: Create auth utilities**

Create `apps/ds-frontend/app/lib/auth.ts`:
```typescript
import { getAccessToken, setAccessToken, clearAccessToken, parseJwt } from '@nest-search/frontend-shared';
import type { AuthUser } from '@nest-search/frontend-shared';

const AUTH_SERVICE_URL = 'http://auth.localhost:3100';
const CURRENT_SERVICE_URL = 'http://ds.localhost:3101';

export function getCasLoginUrl(): string {
  return `${AUTH_SERVICE_URL}/cas/login?service=${encodeURIComponent(CURRENT_SERVICE_URL + '/auth-callback')}`;
}

export function getAuthUser(): AuthUser | null {
  const token = getAccessToken();
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  return { id: payload.sub, username: payload.username, role: payload.role as 'admin' | 'user' };
}

export function handleCasCallback(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.substring(1));
  const token = params.get('access_token');
  if (token) {
    setAccessToken(token);
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}
```

**Step 5: Create AuthProvider**

Create `apps/ds-frontend/app/components/auth/auth-provider.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react';
import { AuthContext } from '@nest-search/frontend-shared';
import type { AuthUser } from '@nest-search/frontend-shared';
import { getAuthUser, getCasLoginUrl, handleCasCallback } from '~/lib/auth';
import { setAccessToken, clearAccessToken } from '@nest-search/frontend-shared';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = handleCasCallback();
    if (token) {
      setUser(getAuthUser());
      setIsLoading(false);
      return;
    }
    const existing = getAuthUser();
    setUser(existing);
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || '登录失败');
    }
    const { accessToken, user: userData } = await res.json();
    setAccessToken(accessToken);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      clearAccessToken();
      setUser(null);
      window.location.href = getCasLoginUrl();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Step 6: Create API helper**

Create `apps/ds-frontend/app/lib/api.ts`:
```typescript
import { apiFetch } from '@nest-search/frontend-shared';
import { withBusinessLine } from './business-line';

export function getProducts(params?: URLSearchParams) {
  const qs = params ? `?${params.toString()}` : '';
  return apiFetch(withBusinessLine(`/api/search/:businessLine/products${qs}`));
}

export function getProduct(id: string) {
  return apiFetch(withBusinessLine(`/api/search/:businessLine/products/${id}`));
}

export function getSchemes() {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes`));
}

export function getScheme(id: string) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes/${id}`));
}

export function createScheme(data: unknown) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes`), {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateScheme(id: string, data: unknown) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteScheme(id: string) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes/${id}`), {
    method: 'DELETE',
  });
}

export function getForms() {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/forms`));
}

export function getForm(id: string) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/forms/${id}`));
}

export function updateForm(id: string, data: unknown) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/forms/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
```

**Step 7: Create resource hooks**

Create `apps/ds-frontend/app/hooks/use-products.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getProducts, getProduct } from '~/lib/api';

export function useProducts(params?: URLSearchParams) {
  return useQuery({
    queryKey: ['products', params?.toString()],
    queryFn: () => getProducts(params),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(id),
    enabled: !!id,
  });
}
```

Create `apps/ds-frontend/app/hooks/use-schemes.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSchemes, getScheme, createScheme, updateScheme, deleteScheme } from '~/lib/api';

export function useSchemes() {
  return useQuery({
    queryKey: ['schemes'],
    queryFn: () => getSchemes(),
  });
}

export function useScheme(id: string) {
  return useQuery({
    queryKey: ['schemes', id],
    queryFn: () => getScheme(id),
    enabled: !!id,
  });
}

export function useCreateScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => createScheme(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schemes'] }),
  });
}

export function useUpdateScheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => updateScheme(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schemes'] }),
  });
}

export function useDeleteScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScheme(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schemes'] }),
  });
}
```

Create `apps/ds-frontend/app/hooks/use-forms.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getForms, getForm, updateForm } from '~/lib/api';

export function useForms() {
  return useQuery({
    queryKey: ['forms'],
    queryFn: () => getForms(),
  });
}

export function useForm(id: string) {
  return useQuery({
    queryKey: ['forms', id],
    queryFn: () => getForm(id),
    enabled: !!id,
  });
}

export function useUpdateForm(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => updateForm(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms'] }),
  });
}
```

**Step 8: Create root layout with sidebar and header**

Create `apps/ds-frontend/app/routes/__root.tsx`:
```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '~/components/auth/auth-provider';
import { Sidebar } from '~/components/layout/sidebar';
import { Header } from '~/components/layout/header';
import '~/styles/app.css';

const queryClient = new QueryClient();

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Step 9: Create sidebar and header**

Create `apps/ds-frontend/app/components/layout/sidebar.tsx`:
```tsx
import { Link } from '@tanstack/react-router';

const navItems = [
  { to: '/products', label: '产品搜索' },
  { to: '/schemes', label: '方案管理' },
  { to: '/forms', label: '表单管理' },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      <div className="p-4 text-xl font-bold border-b border-gray-700">商显管理</div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="block px-3 py-2 rounded hover:bg-gray-700 [&.active]:bg-gray-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

Create `apps/ds-frontend/app/components/layout/header.tsx`:
```tsx
import { useAuth } from '@nest-search/frontend-shared';
import { Button } from '~/components/ui/button';

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold">商显业务系统</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user?.username}</span>
        <Button variant="ghost" size="sm" onClick={logout}>退出</Button>
      </div>
    </header>
  );
}
```

**Step 10: Create auth guard layout**

Create `apps/ds-frontend/app/routes/_authenticated.tsx`:
```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuth } from '@nest-search/frontend-shared';
import { getCasLoginUrl } from '~/lib/auth';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('nest_access_token');
      if (!token) {
        throw redirect({ to: getCasLoginUrl() });
      }
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-4 w-80" />
      </div>
    );
  }

  if (!user) return null;

  return <Outlet />;
}
```

**Step 11: Create page routes**

Create `apps/ds-frontend/app/routes/index.tsx`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/products' });
  },
});
```

Create `apps/ds-frontend/app/routes/_authenticated/products.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useProducts } from '~/hooks/use-products';
import { ProductSearch } from '~/components/products/product-search';
import { ProductList } from '~/components/products/product-list';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/products')({
  component: ProductsPage,
});

function ProductsPage() {
  const [searchParams, setSearchParams] = useState<URLSearchParams>(new URLSearchParams());
  const { data, isLoading, error } = useProducts(searchParams);

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">加载失败</p>
        <button onClick={() => window.location.reload()} className="text-primary underline">
          重试
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">产品搜索</h2>
      <ProductSearch onSearch={setSearchParams} />
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <ProductList products={data as unknown[]} />
      )}
    </div>
  );
}
```

Create `apps/ds-frontend/app/components/products/product-search.tsx`:
```tsx
import { useState } from 'react';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

interface ProductSearchProps {
  onSearch: (params: URLSearchParams) => void;
}

export function ProductSearch({ onSearch }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  function handleSearch() {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    onSearch(params);
  }

  return (
    <div className="flex gap-4 items-end">
      <div className="flex-1 max-w-md">
        <Input
          placeholder="搜索产品..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
      </div>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="分类" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部</SelectItem>
          <SelectItem value="display">显示器</SelectItem>
          <SelectItem value="signage">标牌</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={handleSearch}>搜索</Button>
    </div>
  );
}
```

Create `apps/ds-frontend/app/components/products/product-list.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
}

interface ProductListProps {
  products: Product[];
}

export function ProductList({ products }: ProductListProps) {
  if (!products?.length) {
    return <p className="text-gray-500 mt-6">暂无产品数据</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {products.map((product) => (
        <Card key={product.id}>
          <CardHeader>
            <CardTitle className="text-base">{product.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">{product.description}</p>
            {product.price && (
              <p className="text-lg font-bold mt-2">¥{product.price}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

Create `apps/ds-frontend/app/routes/_authenticated/schemes.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useSchemes } from '~/hooks/use-schemes';
import { SchemeList } from '~/components/schemes/scheme-list';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/schemes')({
  component: SchemesPage,
});

function SchemesPage() {
  const { data, isLoading, error } = useSchemes();

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">加载失败</p>
        <button onClick={() => window.location.reload()} className="text-primary underline">重试</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">方案管理</h2>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <SchemeList schemes={data as unknown[]} />
      )}
    </div>
  );
}
```

Create `apps/ds-frontend/app/components/schemes/scheme-list.tsx`:
```tsx
import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Badge } from '~/components/ui/badge';

interface Scheme {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
}

interface SchemeListProps {
  schemes: Scheme[];
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  active: { label: '启用', variant: 'default' },
  archived: { label: '归档', variant: 'outline' },
};

export function SchemeList({ schemes }: SchemeListProps) {
  if (!schemes?.length) {
    return <p className="text-gray-500">暂无方案数据</p>;
  }

  return (
    <div className="bg-white rounded shadow">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schemes.map((scheme) => {
            const status = statusMap[scheme.status] || statusMap.draft;
            return (
              <TableRow key={scheme.id}>
                <TableCell className="font-medium">{scheme.name}</TableCell>
                <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                <TableCell>
                  <Link to="/schemes/$id" params={{ id: scheme.id }} className="text-primary hover:underline">
                    查看
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

Create `apps/ds-frontend/app/routes/_authenticated/schemes.$id.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useScheme } from '~/hooks/use-schemes';
import { SchemeForm } from '~/components/schemes/scheme-form';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/schemes/$id')({
  component: SchemeDetailPage,
});

function SchemeDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useScheme(id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <p className="text-destructive">加载失败</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">方案详情</h2>
      <SchemeForm initialData={data as Record<string, unknown>} schemeId={id} />
    </div>
  );
}
```

Create `apps/ds-frontend/app/components/schemes/scheme-form.tsx`:
```tsx
import { useState } from 'react';
import { useUpdateScheme } from '~/hooks/use-schemes';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

interface SchemeFormProps {
  initialData?: Record<string, unknown>;
  schemeId?: string;
}

export function SchemeForm({ initialData, schemeId }: SchemeFormProps) {
  const [name, setName] = useState((initialData?.name as string) || '');
  const [status, setStatus] = useState((initialData?.status as string) || 'draft');
  const updateMutation = useUpdateScheme(schemeId || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ name, status });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="name">方案名称</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>状态</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="archived">归档</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  );
}
```

Create `apps/ds-frontend/app/routes/_authenticated/forms.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useForms } from '~/hooks/use-forms';
import { FormList } from '~/components/forms/form-list';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/forms')({
  component: FormsPage,
});

function FormsPage() {
  const { data, isLoading, error } = useForms();

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">加载失败</p>
        <button onClick={() => window.location.reload()} className="text-primary underline">重试</button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">表单管理</h2>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <FormList forms={data as unknown[]} />
      )}
    </div>
  );
}
```

Create `apps/ds-frontend/app/components/forms/form-list.tsx`:
```tsx
import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Badge } from '~/components/ui/badge';

interface Form {
  id: string;
  name: string;
  status: string;
}

interface FormListProps {
  forms: Form[];
}

export function FormList({ forms }: FormListProps) {
  if (!forms?.length) {
    return <p className="text-gray-500">暂无表单数据</p>;
  }

  return (
    <div className="bg-white rounded shadow">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {forms.map((form) => (
            <TableRow key={form.id}>
              <TableCell className="font-medium">{form.name}</TableCell>
              <TableCell>
                <Badge variant={form.status === 'active' ? 'default' : 'secondary'}>
                  {form.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Link to="/forms/$id" params={{ id: form.id }} className="text-primary hover:underline">
                  查看
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

Create `apps/ds-frontend/app/routes/_authenticated/forms.$id.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from '~/hooks/use-forms';
import { FormDetail } from '~/components/forms/form-detail';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/forms/$id')({
  component: FormDetailPage,
});

function FormDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useForm(id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <p className="text-destructive">加载失败</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">表单详情</h2>
      <FormDetail form={data as Record<string, unknown>} />
    </div>
  );
}
```

Create `apps/ds-frontend/app/components/forms/form-detail.tsx`:
```tsx
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

interface FormDetailProps {
  form: Record<string, unknown>;
}

export function FormDetail({ form }: FormDetailProps) {
  if (!form) return <p className="text-gray-500">表单不存在</p>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{form.name as string}</CardTitle>
          <Badge>{form.status as string}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">
          {JSON.stringify(form, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
```

**Step 12: Create auth-callback route**

Create `apps/ds-frontend/app/routes/auth-callback.tsx`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { setAccessToken } from '@nest-search/frontend-shared';

export const Route = createFileRoute('/auth-callback')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
          setAccessToken(token);
          window.history.replaceState(null, '', window.location.pathname);
          throw redirect({ to: '/products' });
        }
      }
      window.location.href = 'http://auth.localhost:3100/cas/login?service=' +
        encodeURIComponent('http://ds.localhost:3101/auth-callback');
    }
  },
});
```

**Step 13: Create router and SSR entry**

Create `apps/ds-frontend/app/router.tsx`:
```typescript
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

Create `apps/ds-frontend/app/ssr.tsx`:
```typescript
import { createStartHandler, defaultStreamHandler } from '@tanstack/start/server';
import { createRouter } from './router';

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);
```

**Step 14: Install dependencies and verify build**

Run: `cd apps/ds-frontend && pnpm install`
Run: `pnpm --filter @nest-search/ds-frontend build`
Expected: Build succeeds

**Step 15: Commit**

```bash
git add apps/ds-frontend/
git commit -m "feat: scaffold ds-frontend with TanStack Start"
```

---

### Task 7: Create zk-frontend and meeting-frontend (copy with business line change)

**Files:**
- Create: `apps/zk-frontend/` (copy of ds-frontend with `BUSINESS_LINE = 'zk'`, port 3102)
- Create: `apps/meeting-frontend/` (copy of ds-frontend with `BUSINESS_LINE = 'meeting'`, port 3103)

**Step 1: Copy ds-frontend to zk-frontend**

Run: `cp -r apps/ds-frontend apps/zk-frontend`

**Step 2: Update zk-frontend config**

Modify `apps/zk-frontend/package.json`: change `name` to `@nest-search/zk-frontend`
Modify `apps/zk-frontend/vite.config.ts`: change port to `3102`
Modify `apps/zk-frontend/app.config.ts`: change port to `3102`
Modify `apps/zk-frontend/app/lib/business-line.ts`: change `BUSINESS_LINE` to `'zk'`
Modify `apps/zk-frontend/app/lib/auth.ts`: change URLs to `zk.localhost:3102`
Modify `apps/zk-frontend/app/routes/auth-callback.tsx`: change URLs to `zk.localhost:3102`
Modify `apps/zk-frontend/app/components/layout/sidebar.tsx`: change title to `道闸管理`
Modify `apps/zk-frontend/app/components/layout/header.tsx`: change title to `道闸业务系统`

**Step 3: Copy ds-frontend to meeting-frontend**

Run: `cp -r apps/ds-frontend apps/meeting-frontend`

**Step 4: Update meeting-frontend config**

Modify `apps/meeting-frontend/package.json`: change `name` to `@nest-search/meeting-frontend`
Modify `apps/meeting-frontend/vite.config.ts`: change port to `3103`
Modify `apps/meeting-frontend/app.config.ts`: change port to `3103`
Modify `apps/meeting-frontend/app/lib/business-line.ts`: change `BUSINESS_LINE` to `'meeting'`
Modify `apps/meeting-frontend/app/lib/auth.ts`: change URLs to `meeting.localhost:3103`
Modify `apps/meeting-frontend/app/routes/auth-callback.tsx`: change URLs to `meeting.localhost:3103`
Modify `apps/meeting-frontend/app/components/layout/sidebar.tsx`: change title to `会议管理`
Modify `apps/meeting-frontend/app/components/layout/header.tsx`: change title to `会议业务系统`

**Step 5: Install dependencies for both**

Run: `pnpm --filter @nest-search/zk-frontend install && pnpm --filter @nest-search/meeting-frontend install`

**Step 6: Commit**

```bash
git add apps/zk-frontend/ apps/meeting-frontend/
git commit -m "feat: add zk-frontend and meeting-frontend"
```

---

## Phase 5: Backend Gateway Proxy for Frontend

### Task 8: Register frontend services in CAS and add gateway CORS

**Files:**
- Modify: `apps/auth-service/src/database/drizzle.service.ts` (add seed for 4 frontend services)
- Modify: `apps/gateway/src/main.ts` (add CORS for frontend origins)

**Step 1: Seed CAS services for frontends**

Modify `apps/auth-service/src/database/drizzle.service.ts` `seedServices()` to include:
```typescript
{ serviceId: 'auth-frontend', serviceUrl: 'http://auth.localhost:3100/auth-callback', name: '认证中心' },
{ serviceId: 'ds-frontend', serviceUrl: 'http://ds.localhost:3101/auth-callback', name: '商显前端' },
{ serviceId: 'zk-frontend', serviceUrl: 'http://zk.localhost:3102/auth-callback', name: '道闸前端' },
{ serviceId: 'meeting-frontend', serviceUrl: 'http://meeting.localhost:3103/auth-callback', name: '会议前端' },
```

**Step 2: Update gateway CORS**

Modify `apps/gateway/src/main.ts` to allow CORS from frontend origins:
```typescript
app.enableCors({
  origin: [
    'http://auth.localhost:3100',
    'http://ds.localhost:3101',
    'http://zk.localhost:3102',
    'http://meeting.localhost:3103',
  ],
  credentials: true,
});
```

**Step 3: Commit**

```bash
git add apps/auth-service/src/database/drizzle.service.ts apps/gateway/src/main.ts
git commit -m "feat: register frontend services in CAS and add CORS"
```

---

## Phase 6: Integration Testing

### Task 9: Manual Integration Test

**Step 1: Update /etc/hosts**

Add to `/etc/hosts`:
```
127.0.0.1 auth.localhost ds.localhost zk.localhost meeting.localhost
```

**Step 2: Start all services**

Run: `npm run start:all`

**Step 3: Start all frontends (separate terminal)**

Run: `pnpm --filter @nest-search/auth-frontend dev & pnpm --filter @nest-search/ds-frontend dev & pnpm --filter @nest-search/zk-frontend dev & pnpm --filter @nest-search/meeting-frontend dev`

**Step 4: Test login flow**

1. Open `http://ds.localhost:3101/products`
2. Should redirect to `http://auth.localhost:3100/cas/login?service=http://ds.localhost:3101/auth-callback`
3. Enter credentials, submit
4. Should redirect back to `http://ds.localhost:3101/auth-callback#access_token=xxx`
5. Should land on products page

**Step 5: Test cross-system SSO**

1. Open `http://zk.localhost:3102/products` (in same browser)
2. Should redirect to `http://auth.localhost:3100/cas/login?service=http://zk.localhost:3102/auth-callback`
3. CAS should detect TGC cookie, auto-issue ST, redirect back with token
4. Should land on zk products page without password prompt

**Step 6: Test logout**

1. Click logout in ds-frontend
2. Should clear localStorage, call `/api/auth/logout`
3. Try accessing zk-frontend — should redirect to login

**Step 7: Document test results**

Create `docs/frontend-integration-test.md` with test results.

**Step 8: Commit**

```bash
git add docs/frontend-integration-test.md
git commit -m "docs: add frontend integration test results"
```

---

## File Summary

### New Files Created

| Phase | Path | Purpose |
|-------|------|---------|
| 1 | `apps/auth-service/src/redis/redis.service.ts` | Redis client service |
| 1 | `apps/auth-service/src/redis/redis.module.ts` | Redis global module |
| 2 | `pnpm-workspace.yaml` | pnpm workspace config |
| 3 | `libs/frontend-shared/package.json` | Shared lib package |
| 3 | `libs/frontend-shared/tsconfig.json` | TS config |
| 3 | `libs/frontend-shared/src/types.ts` | Shared types |
| 3 | `libs/frontend-shared/src/auth.ts` | Token management |
| 3 | `libs/frontend-shared/src/api-client.ts` | Fetch wrapper with auto-refresh |
| 3 | `libs/frontend-shared/src/hooks/use-auth.ts` | Auth context |
| 3 | `libs/frontend-shared/src/hooks/use-api.ts` | TanStack Query wrapper |
| 3 | `libs/frontend-shared/src/index.ts` | Barrel export |
| 4 | `apps/auth-frontend/` (all files) | Auth frontend |
| 5 | `apps/ds-frontend/` (all files) | Business line frontend (template) |
| 5 | `apps/ds-frontend/app/components/products/product-search.tsx` | Search + filters |
| 5 | `apps/ds-frontend/app/components/products/product-list.tsx` | Product grid |
| 5 | `apps/ds-frontend/app/components/schemes/scheme-list.tsx` | Scheme table |
| 5 | `apps/ds-frontend/app/components/schemes/scheme-form.tsx` | Scheme edit form |
| 5 | `apps/ds-frontend/app/components/forms/form-list.tsx` | Form table |
| 5 | `apps/ds-frontend/app/components/forms/form-detail.tsx` | Form detail view |
| 5 | `apps/ds-frontend/app/hooks/use-products.ts` | Product query hooks |
| 5 | `apps/ds-frontend/app/hooks/use-schemes.ts` | Scheme query hooks |
| 5 | `apps/ds-frontend/app/hooks/use-forms.ts` | Form query hooks |
| 6 | `apps/zk-frontend/` (copy of ds) | Business line frontend |
| 6 | `apps/meeting-frontend/` (copy of ds) | Business line frontend |

### Modified Files

| Phase | Path | Change |
|-------|------|--------|
| 1 | `package.json` | Add ioredis |
| 1 | `.env` | Add Redis config |
| 1 | `apps/auth-service/src/auth/auth.service.ts` | Dual token logic |
| 1 | `apps/auth-service/src/auth/auth.controller.ts` | New endpoints |
| 1 | `apps/auth-service/src/auth/auth.module.ts` | Import Redis |
| 1 | `apps/auth-service/src/app.module.ts` | Import RedisModule |
| 7 | `apps/auth-service/src/database/drizzle.service.ts` | Seed frontend services |
| 7 | `apps/gateway/src/main.ts` | CORS config |
