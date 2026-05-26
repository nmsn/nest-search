import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useProducts } from '~/hooks/use-products';
import { ProductSearch } from '~/components/products/product-search';
import { ProductList } from '~/components/products/product-list';

export const Route = createFileRoute('/_authenticated/products')({
  component: ProductsPage,
});

function ProductsPage() {
  const [searchParams, setSearchParams] = useState<URLSearchParams>(new URLSearchParams());
  const { data, isLoading, error } = useProducts(searchParams);

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">加载失败</p>
        <button onClick={() => window.location.reload()} className="text-blue-600 underline">重试</button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">产品搜索</h2>
      <ProductSearch onSearch={setSearchParams} />
      {isLoading ? <div className="mt-6">加载中...</div> : <ProductList products={data as unknown[]} />}
    </div>
  );
}
