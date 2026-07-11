import type { MetadataRoute } from "next";

import { publicUrl } from "@/lib/seo/public-metadata";

const CANONICAL_SITEMAP = publicUrl("/sitemap.xml");

export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV !== "production") {
    return {
      rules: { userAgent: "*", disallow: "/" },
      sitemap: CANONICAL_SITEMAP,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: CANONICAL_SITEMAP,
  };
}
