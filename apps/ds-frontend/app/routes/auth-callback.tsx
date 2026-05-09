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
