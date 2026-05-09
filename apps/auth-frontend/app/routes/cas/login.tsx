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
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">CAS 单点登录</h1>
        <LoginForm />
      </div>
    </div>
  );
}
