import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

const globalForDb = globalThis as unknown as { __orbitPool?: Pool; __orbitDb?: DB };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
}

/** Lazily-created singleton (survives Next.js dev hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__orbitDb) {
    globalForDb.__orbitPool = createPool();
    globalForDb.__orbitDb = drizzle(globalForDb.__orbitPool, { schema });
  }
  return globalForDb.__orbitDb;
}

export async function closeDb() {
  await globalForDb.__orbitPool?.end();
  globalForDb.__orbitPool = undefined;
  globalForDb.__orbitDb = undefined;
}

export { schema };
