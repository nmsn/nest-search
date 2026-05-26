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
