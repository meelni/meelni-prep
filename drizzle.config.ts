import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./lib/db/schema.ts", "./lib/db/schema-preview-shadow.ts"],
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
