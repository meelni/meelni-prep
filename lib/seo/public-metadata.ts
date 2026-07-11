import type { Metadata } from "next";

export const PUBLIC_ORIGIN = "https://www.meelni.com";

export function publicUrl(pathname: string): string {
  return new URL(pathname, PUBLIC_ORIGIN).toString();
}

export function publicMetadata(
  pathname: string,
  metadata: Omit<Metadata, "alternates"> = {}
): Metadata {
  return {
    ...metadata,
    alternates: {
      canonical: publicUrl(pathname),
    },
    openGraph: {
      ...metadata.openGraph,
      url: publicUrl(pathname),
    },
  };
}
