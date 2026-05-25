/// <reference types="vite/client" />
import {
  createRootRouteWithContext,
  Outlet,
  ScrollRestoration,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <ScrollRestoration />
        <QueryClientProvider client={queryClient}>
          <div className="min-h-screen bg-gray-50">
            <Outlet />
          </div>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
