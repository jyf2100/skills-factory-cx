import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

function defaultMigrationsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "migrations");
}

export async function runMigrations(pool: Pool, migrationsDir = defaultMigrationsDir()): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [20260306]);
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const existing = await client.query<{ version: string }>("select version from schema_migrations where version = $1", [file]);
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations(version) values ($1)", [file]);
        await client.query("commit");
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      }
    }
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [20260306]);
    } catch {
      // ignore unlock errors
    }
    client.release();
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    return;
  }
}
