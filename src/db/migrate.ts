import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./index";

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => console.log("Migrations applied."))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
