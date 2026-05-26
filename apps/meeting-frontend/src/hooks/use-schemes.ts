import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSchemes, getScheme, createScheme, updateScheme, deleteScheme } from '~/lib/api';

export function useSchemes() {
  return useQuery({ queryKey: ['schemes'], queryFn: () => getSchemes() });
}

export function useScheme(id: string) {
  return useQuery({ queryKey: ['schemes', id], queryFn: () => getScheme(id), enabled: !!id });
}

export function useCreateScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => createScheme(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schemes'] }),
  });
}

export function useUpdateScheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => updateScheme(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schemes'] }),
  });
}

export function useDeleteScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScheme(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schemes'] }),
  });
}
