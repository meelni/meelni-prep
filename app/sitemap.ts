import { MetadataRoute } from "next";

import { blogPosts } from "@/lib/blog-data";
import { companies } from "@/lib/data/companies";
import { publicUrl } from "@/lib/seo/public-metadata";

const STATIC_PUBLIC_ROUTES = [
  "",
  "/explore",
  "/companies",
  "/pricing",
  "/blog",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...STATIC_PUBLIC_ROUTES.map((route) => ({
      url: publicUrl(route || "/"),
    })),
    ...companies.map((company) => ({
      url: publicUrl(`/companies/${company.slug}`),
    })),
    ...blogPosts.map((post) => ({
      url: publicUrl(`/blog/${post.id}`),
    })),
  ];
}
