interface Product {
  productId: string;
  name: string;
  spec?: string;
  price?: number;
  brand?: string;
  category?: string;
  stock?: number;
}

interface ProductListProps {
  products: Product[];
}

export function ProductList({ products }: ProductListProps) {
  if (!products?.length) return <p className="text-gray-500 mt-6">暂无产品数据</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {products.map((product) => (
        <div key={product.productId} className="bg-white p-4 rounded shadow">
          <h3 className="font-medium">{product.name}</h3>
          <p className="text-sm text-gray-600 mt-1">{product.brand} · {product.category}</p>
          <p className="text-sm text-gray-500">{product.spec}</p>
          <div className="flex justify-between items-center mt-2">
            {product.price && <p className="text-lg font-bold">¥{product.price}</p>}
            {product.stock !== undefined && <p className="text-sm text-gray-400">库存: {product.stock}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
