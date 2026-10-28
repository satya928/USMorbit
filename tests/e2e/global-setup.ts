import { closeDb, getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { resetDemoData, seedDemo } from "@/db/seed";

export default async function globalSetup() {
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://orbit:orbit@localhost:5432/orbit_e2e";
  await runMigrations();
  await getDb().transaction(async (tx) => {
    await resetDemoData(tx);
    await seedDemo(tx);
  });
  await closeDb();
}
