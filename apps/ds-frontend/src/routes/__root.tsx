import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '~/components/auth/auth-provider'
import { setLoginUrl } from '@nest-search/frontend-shared'
import { getCasLoginUrl } from '~/lib/auth'
import { Header } from '~/components/layout/header'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'

const queryClient = new QueryClient()

setLoginUrl(getCasLoginUrl())

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="flex h-screen">
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </AuthProvider>
    </QueryClientProvider>
  )
}
