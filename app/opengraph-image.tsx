import { ImageResponse } from "next/og";
import React from "react";

import { PRODUCT_LANGUAGE } from "@/lib/product-language";
import { PUBLIC_SOCIAL_IMAGE_ALT } from "@/lib/seo/public-metadata";

// Route segment config
export const runtime = "edge";

// Image metadata
export const alt = PUBLIC_SOCIAL_IMAGE_ALT;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Image generation
export function SocialImageArtwork() {
  return (
    <div
      style={{
        fontSize: 128,
        background:
          "linear-gradient(135deg, oklch(0.70 0.22 285) 0%, oklch(0.60 0.20 285) 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: "bold",
      }}
    >
      <div style={{ fontSize: 180, marginBottom: 20 }}>M</div>
      <div style={{ fontSize: 48 }}>Meelni</div>
      <div style={{ fontSize: 32, opacity: 0.9 }}>
        {PRODUCT_LANGUAGE.category}
      </div>
    </div>
  );
}

export default async function Image() {
  return new ImageResponse(<SocialImageArtwork />, {
    ...size,
  });
}
