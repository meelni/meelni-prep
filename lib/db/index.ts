import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = postgres(databaseUrl, {
    // Safe for Supabase transaction-pooler URLs and keeps each serverless
    // instance from opening a large pool against the shared database.
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

type Database = ReturnType<typeof createDb>;

export const db: Database = process.env.DATABASE_URL
  ? createDb()
  : new Proxy({} as Database, {
      get() {
        throw new Error("DATABASE_URL environment variable is not set");
      },
    });
