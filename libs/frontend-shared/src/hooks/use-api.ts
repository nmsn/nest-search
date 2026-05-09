import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export function useApiQuery<T>(key: string[], path: string) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path),
  });
}

export function useApiMutation<T, B = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  invalidateKeys?: string[][],
) {
  const queryClient = useQueryClient();
  return useMutation<T, Error, B>({
    mutationFn: (body: B) =>
      apiFetch<T>(path, {
        method,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      if (invalidateKeys) {
        invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }
    },
  });
}
