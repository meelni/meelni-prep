import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const harnessRoot = fileURLToPath(new URL("./harness", import.meta.url));
const shim = (name: string) =>
  fileURLToPath(new URL(`./harness/shims/${name}`, import.meta.url));

const config = {
  root: harnessRoot,
  resolve: {
    alias: [
      { find: "next/link", replacement: shim("next-link.tsx") },
      { find: "next/navigation", replacement: shim("next-navigation.ts") },
      { find: "next/image", replacement: shim("next-image.tsx") },
      {
        find: "@/app/providers/auth-provider",
        replacement: shim("auth-provider.tsx"),
      },
      {
        find: "@/lib/analytics/analytics-service",
        replacement: shim("analytics-service.ts"),
      },
      {
        find: "@/lib/analytics/use-web-vitals",
        replacement: shim("use-web-vitals.ts"),
      },
      {
        find: /^@\/lib\/feature-flags$/,
        replacement: shim("feature-flags.ts"),
      },
      { find: "posthog-js/react", replacement: shim("posthog-react.ts") },
      {
        find: "@meelni/test-fixtures",
        replacement: `${root}/packages/test-fixtures/src/index.ts`,
      },
      {
        find: "@meelni/integrations",
        replacement: `${root}/packages/integrations/src/index.ts`,
      },
      {
        find: "@meelni/agent",
        replacement: `${root}/packages/agent/src/index.ts`,
      },
      {
        find: "@meelni/core",
        replacement: `${root}/packages/core/src/index.ts`,
      },
      { find: "@", replacement: root },
    ],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    "process.env.NEXT_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_POSTHOG_HOST": JSON.stringify(""),
  },
  server: {
    strictPort: true,
    fs: { allow: [root] },
  },
};

export default config;
