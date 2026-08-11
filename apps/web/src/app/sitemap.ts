import type { MetadataRoute } from "next";
import { serviceCategories } from "@/data/site";
import { siteUrl } from "@/data/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/layanan", "/kontak", "/sertifikasi-legalitas"].map(
    (path) => ({
      url: `${siteUrl}${path}`,
      lastModified: new Date(),
    }),
  );

  const categoryRoutes = serviceCategories.map((category) => ({
    url: `${siteUrl}/layanan/kalibrasi-${category.slug}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...categoryRoutes];
}
