import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuth } from '@nest-search/frontend-shared';
import { getCasLoginUrl } from '~/lib/auth';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('nest_access_token');
      if (!token) throw redirect({ to: getCasLoginUrl() });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-6">加载中...</div>;
  if (!user) return null;
  return <Outlet />;
}
