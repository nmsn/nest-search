export interface Product {
  productId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  spec: string;
  price: number;
  unit: string;
  stock: number;
  imageUrl: string;
  attributes: Record<string, any>;
  syncedAt: Date;
  businessLine: string;
}
