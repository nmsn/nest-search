/// <reference types="vite/client" />
import { createRootRouteWithContext, Outlet, HeadContent } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '~/components/auth/auth-provider';
import { Sidebar } from '~/components/layout/sidebar';
import { Header } from '~/components/layout/header';
import appCss from '~/styles/app.css?url';

const queryClient = new QueryClient();

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
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
