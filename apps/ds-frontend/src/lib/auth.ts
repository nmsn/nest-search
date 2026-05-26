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
