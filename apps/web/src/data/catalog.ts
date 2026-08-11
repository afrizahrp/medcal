import productsData from "@/data/products.json";
import { kanAccreditedProducts } from "@/data/site";

export type Product = {
  name: string;
  categorySlug: string;
  categoryName: string;
  accredited: boolean;
};

type ProductRow = {
  name: string;
  categorySlug: string;
  categoryName: string;
  accredited?: boolean;
};

function makeKey(categorySlug: string, name: string) {
  return `${categorySlug}::${name.trim().toLowerCase()}`;
}

const kanAccreditedKeys = new Set(
  kanAccreditedProducts.map((item) => makeKey(item.categorySlug, item.name)),
);

export const products: Product[] = (productsData as ProductRow[]).map((item) => ({
  name: item.name,
  categorySlug: item.categorySlug,
  categoryName: item.categoryName,
  accredited: kanAccreditedKeys.has(makeKey(item.categorySlug, item.name)),
}));
