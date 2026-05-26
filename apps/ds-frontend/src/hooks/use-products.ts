import { useQuery } from '@tanstack/react-query';
import { getProducts, getProduct } from '~/lib/api';

export function useProducts(params?: URLSearchParams) {
  return useQuery({
    queryKey: ['products', params?.toString()],
    queryFn: () => getProducts(params),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(id),
    enabled: !!id,
  });
}
