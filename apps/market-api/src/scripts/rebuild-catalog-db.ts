import { loadDotEnv } from "@skills/shared";
import { loadConfig } from "../config.js";
import { createDbPool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { CatalogProjector } from "../services/catalog-projector.js";

loadDotEnv();
const config = loadConfig();
const pool = createDbPool(config);

try {
  await runMigrations(pool);
  const projector = new CatalogProjector(pool, config);
  await projector.rebuildAll();
  process.stdout.write("catalog db rebuild completed\n");
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
