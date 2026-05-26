interface Product {
  id: string;
  name: string;
  description?: string;
  price?: number;
}

interface ProductListProps {
  products: Product[];
}

export function ProductList({ products }: ProductListProps) {
  if (!products?.length) return <p className="text-gray-500 mt-6">暂无产品数据</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {products.map((product) => (
        <div key={product.id} className="bg-white p-4 rounded shadow">
          <h3 className="font-medium">{product.name}</h3>
          <p className="text-sm text-gray-600 mt-1">{product.description}</p>
          {product.price && <p className="text-lg font-bold mt-2">¥{product.price}</p>}
        </div>
      ))}
    </div>
  );
}
