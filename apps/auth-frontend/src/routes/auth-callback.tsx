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
