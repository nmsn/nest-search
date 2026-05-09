# Frontend Architecture Design

## Goal

Build multiple frontend applications using TanStack Start for the nest-search project: an authentication center (login page) and 3 business line frontends (商显、道闸、会议). Each frontend integrates with the backend CAS SSO and service APIs.

## Architecture

### Overview

Add 4 frontend apps to the existing `nest-search` monorepo, plus a shared frontend library. Each app is an independent TanStack Start application with its own port and domain.

```
nest-search/
├── apps/
│   ├── gateway/           (existing)
│   ├── auth-service/      (existing)
│   ├── search-service/    (existing)
│   ├── form-service/      (existing)
│   ├── sync-service/      (existing)
│   ├── auth-frontend/     (NEW - CAS login page)
│   ├── ds-frontend/       (NEW - 商显业务)
│   ├── zk-frontend/       (NEW - 道闸业务)
│   └── meeting-frontend/  (NEW - 会议业务)
├── libs/
│   ├── shared/            (existing - backend shared)
│   └── frontend-shared/   (NEW - frontend shared)
├── pnpm-workspace.yaml    (NEW)
└── package.json           (modify)
```

### Tech Stack

- **Framework**: TanStack Start (React 19, Vite 6)
- **Routing**: TanStack Router (file-based)
- **Data Fetching**: TanStack Query
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix UI primitives)
- **State**: React Query for server state, React Context for auth state
- **Package Manager**: pnpm workspaces

### Domain Structure

| Project | Port | Domain | Purpose |
|---------|------|--------|---------|
| auth-frontend | 3100 | auth.localhost | CAS 登录页面 |
| ds-frontend | 3101 | ds.localhost | 商显业务前端 |
| zk-frontend | 3102 | zk.localhost | 道闸业务前端 |
| meeting-frontend | 3103 | meeting.localhost | 会议业务前端 |

Development requires `/etc/hosts` entries:
```
127.0.0.1 auth.localhost ds.localhost zk.localhost meeting.localhost
```

## Authentication

### Dual Token Strategy

Replace the current single JWT with a dual-token mechanism for cross-system logout support.

**Token Types:**
- **Access Token**: 15 minutes, stored in localStorage, contains `{ sub, username, role }`
- **Refresh Token**: 7 days, stored in httpOnly cookie (domain=.localhost), contains `{ sub, tokenId }`

**Storage:**
- Access Token: localStorage (per-domain, each frontend stores its own)
- Refresh Token: httpOnly cookie on `.localhost` domain (shared across all frontends)
- Redis: stores refresh token whitelist + blacklist

### Login Flow

```
1. User visits ds.localhost:3101/products
   → Frontend checks localStorage for accessToken
   → Not found → redirect to auth.localhost:3100/cas/login?service=http://ds.localhost:3101/callback

2. auth.localhost:3100 shows login form
   → User enters credentials
   → POST /api/auth/login → Gateway → Auth Service
   → Auth Service validates, issues accessToken + refreshToken
   → Sets refreshToken cookie on .localhost domain
   → Returns { accessToken, user }

3. auth-frontend receives response
   → Stores accessToken in localStorage
   → Redirects back to service URL with accessToken in URL fragment (#access_token=xxx)

4. ds.localhost:3101/callback
   → Reads accessToken from URL fragment
   → Stores in localStorage
   → Redirects to original page /products

5. Subsequent requests
   → Each API request: Authorization: Bearer <accessToken>
   → Gateway CasGuard verifies accessToken
```

### Auto-Login (Cross-System SSO)

```
1. User is logged into 商显 (has accessToken in ds.localhost localStorage)
2. User visits 道闸 zk.localhost:3102/dashboard
   → No accessToken in zk.localhost localStorage
   → Redirect to auth.localhost:3100/cas/login?service=http://zk.localhost:3102/callback

3. auth.localhost:3100 checks refreshToken cookie (.localhost domain)
   → Cookie exists and valid → auto-issue new accessToken
   → Redirect back to zk.localhost:3102/callback#access_token=xxx
   → User doesn't need to enter password
```

### Token Refresh Flow

```
1. API request returns 401
2. Frontend calls POST /api/auth/refresh
   → Sends refreshToken cookie automatically
   → Auth Service validates refreshToken (check Redis whitelist, not in blacklist)
   → Issues new accessToken + rotates refreshToken
   → Returns { accessToken }
3. Frontend retries original request with new accessToken
4. If refresh fails → redirect to CAS login page
```

### Logout Flow

```
1. User clicks logout in any frontend
2. Frontend calls POST /api/auth/logout
3. Auth Service:
   → Adds refreshToken to Redis blacklist
   → Removes from whitelist
4. Frontend:
   → Clears localStorage accessToken
   → Redirects to login page
5. Other systems:
   → accessToken expires within 15 minutes
   → Refresh attempt fails (token in blacklist)
   → Redirect to login page
```

## Backend Changes Required

### Auth Service Modifications

The auth-service needs to be extended with:

1. **Redis connection** for token storage
2. **Refresh Token generation** and validation
3. **Token rotation** on refresh
4. **Blacklist management** for logout

**New endpoints:**
```
POST /api/auth/login → returns { accessToken, user } + sets refreshToken cookie
POST /api/auth/refresh → rotates tokens, returns { accessToken }
POST /api/auth/logout → blacklists refreshToken
```

**Redis key structure:**
```
refresh_token:{tokenId} → { userId, username, role, expiresAt }  (whitelist)
refresh_token_blacklist:{tokenId} → "1"  (blacklist, TTL = 7 days)
```

## Frontend Project Structure

### auth-frontend

```
apps/auth-frontend/
├── app/
│   ├── routes/
│   │   ├── __root.tsx              # Root layout
│   │   ├── index.tsx               # Redirect to /cas/login
│   │   ├── cas/
│   │   │   └── login.tsx           # Login page with form
│   │   └── callback.tsx            # CAS callback (receives access_token)
│   ├── components/
│   │   └── login-form.tsx          # Login form component
│   └── lib/
│       └── api.ts                  # API client for auth endpoints
├── package.json
├── vite.config.ts
├── tsconfig.json
└── app.config.ts                   # TanStack Start config
```

### Business Line Frontend (ds/zk/meeting - identical structure)

```
apps/{ds,zk,meeting}-frontend/
├── app/
│   ├── routes/
│   │   ├── __root.tsx              # Root layout (nav sidebar)
│   │   ├── index.tsx               # Redirect to /products
│   │   ├── _authenticated.tsx      # Auth guard layout
│   │   ├── _authenticated/
│   │   │   ├── products.tsx        # Product search page
│   │   │   ├── schemes.tsx         # Scheme list page
│   │   │   ├── schemes.$id.tsx     # Scheme detail/edit
│   │   │   ├── forms.tsx           # Form list page
│   │   │   └── forms.$id.tsx       # Form detail/edit
│   │   └── callback.tsx            # CAS callback
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx         # Navigation sidebar
│   │   │   └── header.tsx          # Top header with user info
│   │   ├── products/
│   │   │   ├── product-search.tsx  # Search input + filters
│   │   │   └── product-list.tsx    # Product grid/list
│   │   ├── schemes/
│   │   │   ├── scheme-list.tsx     # Scheme table
│   │   │   └── scheme-form.tsx     # Scheme create/edit form
│   │   └── forms/
│   │       ├── form-list.tsx       # Form table
│   │       └── form-detail.tsx     # Form detail view
│   ├── hooks/
│   │   ├── use-auth.ts             # Auth state hook
│   │   ├── use-products.ts         # Product query hooks
│   │   ├── use-schemes.ts          # Scheme query hooks
│   │   └── use-forms.ts            # Form query hooks
│   └── lib/
│       ├── api.ts                  # API client (auto token refresh)
│       └── auth.ts                 # Auth utilities
├── package.json
├── vite.config.ts
├── tsconfig.json
└── app.config.ts
```

### Shared Library (libs/frontend-shared/)

```
libs/frontend-shared/
├── src/
│   ├── index.ts                    # Barrel export
│   ├── api-client.ts               # Fetch wrapper with auto-refresh
│   ├── auth.ts                     # Token storage, refresh, redirect
│   ├── types.ts                    # Shared TypeScript types
│   └── hooks/
│       ├── use-auth.ts             # Auth context hook
│       └── use-api.ts              # TanStack Query wrapper with auth
├── package.json
└── tsconfig.json
```

## Page Designs

### Login Page (auth-frontend)

Simple centered card layout:
- Username input
- Password input
- Login button
- Error message display

After login: redirect to callback URL with access token.

### Product Search Page

- Search bar at top
- Filter sidebar (category, price range, etc.)
- Product grid with cards
- Pagination

### Scheme Management Page

- Table listing all schemes
- Create button → modal/page with form
- Edit/Delete actions per row
- Status filter (draft, active, archived)

### Form Management Page

- Table listing all forms
- Status column with badges
- View detail → expand or navigate
- Update status action

## Error Handling

- **401 from API**: Auto-refresh token, retry request, redirect to login if refresh fails
- **403 from API**: Show "insufficient permissions" message
- **Network error**: Show retry button with error message
- **Loading states**: Skeleton loaders for all data-fetching pages

## Security Considerations

- Access Token in localStorage (XSS risk mitigated by httpOnly refresh token)
- Refresh Token in httpOnly cookie (not accessible via JavaScript)
- CSRF protection: SameSite=lax on refresh token cookie
- Token rotation on each refresh (old token invalidated)
- Redis blacklist for immediate logout enforcement
