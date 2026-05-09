import { apiFetch } from '@nest-search/frontend-shared';
import { withBusinessLine } from './business-line';

export function getProducts(params?: URLSearchParams) {
  const qs = params ? `?${params.toString()}` : '';
  return apiFetch(withBusinessLine(`/api/search/:businessLine/products${qs}`));
}

export function getProduct(id: string) {
  return apiFetch(withBusinessLine(`/api/search/:businessLine/products/${id}`));
}

export function getSchemes() {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes`));
}

export function getScheme(id: string) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes/${id}`));
}

export function createScheme(data: unknown) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes`), {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateScheme(id: string, data: unknown) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteScheme(id: string) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/schemes/${id}`), {
    method: 'DELETE',
  });
}

export function getForms() {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/forms`));
}

export function getForm(id: string) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/forms/${id}`));
}

export function updateForm(id: string, data: unknown) {
  return apiFetch(withBusinessLine(`/api/form/:businessLine/forms/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
