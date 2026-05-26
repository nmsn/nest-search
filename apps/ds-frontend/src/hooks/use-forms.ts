import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getForms, getForm, updateForm } from '~/lib/api';

export function useForms() {
  return useQuery({ queryKey: ['forms'], queryFn: () => getForms() });
}

export function useForm(id: string) {
  return useQuery({ queryKey: ['forms', id], queryFn: () => getForm(id), enabled: !!id });
}

export function useUpdateForm(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => updateForm(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms'] }),
  });
}
