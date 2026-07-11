import type { Metadata } from "next";

import { PRODUCT_LANGUAGE } from "@/lib/product-language";

export const PUBLIC_ORIGIN = "https://www.meelni.com";
export const PUBLIC_SOCIAL_IMAGE_PATH = "/opengraph-image";
export const PUBLIC_SOCIAL_IMAGE_ALT = `Meelni - ${PRODUCT_LANGUAGE.category}`;

const PUBLIC_SOCIAL_IMAGE = {
  url: PUBLIC_SOCIAL_IMAGE_PATH,
  width: 1200,
  height: 630,
  alt: PUBLIC_SOCIAL_IMAGE_ALT,
};

export function publicUrl(pathname: string): string {
  return new URL(pathname, PUBLIC_ORIGIN).toString();
}

export function publicMetadata(
  pathname: string,
  metadata: Omit<Metadata, "alternates"> = {}
): Metadata {
  const title = typeof metadata.title === "string" ? metadata.title : undefined;

  return {
    ...metadata,
    alternates: {
      canonical: publicUrl(pathname),
    },
    openGraph: {
      url: publicUrl(pathname),
      siteName: "Meelni",
      locale: "en_US",
      images: [PUBLIC_SOCIAL_IMAGE],
      ...(title ? { title } : {}),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...metadata.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      images: [PUBLIC_SOCIAL_IMAGE],
      ...(title ? { title } : {}),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...metadata.twitter,
    },
    robots: {
      index: true,
      follow: true,
      ...(typeof metadata.robots === "object" ? metadata.robots : {}),
    },
  };
}
