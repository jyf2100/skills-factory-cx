import { mkdirSync } from "node:fs";
import { ensureEd25519Keypair, loadDotEnv } from "@skills/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDbPool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { CatalogProjector } from "./services/catalog-projector.js";
import { PostgresCatalogService } from "./services/postgres-catalog.js";
import type { Pool } from "pg";
import type { CatalogReader } from "./services/catalog-model.js";
import { JsonStateStore } from "./state.js";

loadDotEnv();
const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
mkdirSync(config.localSkillsRepo, { recursive: true });
ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

const store = new JsonStateStore(config.dataDir, config.whitelistSources);
let catalog: CatalogReader | undefined;
let catalogProjector: CatalogProjector | undefined;
let pool: Pool | undefined;

if (config.catalogBackend === "postgres") {
  pool = createDbPool(config);
  await runMigrations(pool);
  catalogProjector = new CatalogProjector(pool, config);
  catalog = new PostgresCatalogService(pool, config);
}

const app = createApp({ config, store, catalog, catalogProjector });
const server = app.listen(config.port, config.host, () => {
  process.stdout.write(`market-api listening on ${config.baseUrl}\n`);
});

server.on("close", () => {
  if (pool) {
    void pool.end().catch(() => {});
  }
});
