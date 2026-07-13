import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "@meelni/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url)
      ),
      "@meelni/agent": fileURLToPath(
        new URL("./packages/agent/src/index.ts", import.meta.url)
      ),
      "@meelni/integrations": fileURLToPath(
        new URL("./packages/integrations/src/index.ts", import.meta.url)
      ),
      "@meelni/test-fixtures": fileURLToPath(
        new URL("./packages/test-fixtures/src/index.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
  },
});
