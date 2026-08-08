import productsData from "@/data/products.json";

export type Product = {
  name: string;
  categorySlug: string;
  categoryName: string;
  accredited: boolean;
};

export const products: Product[] = productsData;
