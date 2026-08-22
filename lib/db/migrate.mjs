import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter(file => file.endsWith(".sql"))
  .sort();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('homehub-schema-migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  for (const filename of migrationFiles) {
    await client.query("BEGIN");
    try {
      const result = await client.query(
        `INSERT INTO "schema_migrations" ("filename") VALUES ($1)
         ON CONFLICT ("filename") DO NOTHING
         RETURNING "filename"`,
        [filename],
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        console.log(`Skipped ${filename} (already applied)`);
        continue;
      }

      await client.query(readFileSync(join(migrationsDir, filename), "utf8"));
      await client.query("COMMIT");
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext('homehub-schema-migrations'))");
  } catch {
    // The connection may not have been established if configuration failed.
  }
  await client.end();
}