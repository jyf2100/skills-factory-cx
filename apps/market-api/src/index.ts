import { mkdirSync } from "node:fs";
import { ensureEd25519Keypair, loadDotEnv } from "@skills/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { JsonStateStore } from "./state.js";

loadDotEnv();
const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
mkdirSync(config.localSkillsRepo, { recursive: true });
ensureEd25519Keypair(config.signingPrivateKeyPath, config.signingPublicKeyPath);

const store = new JsonStateStore(config.dataDir, config.whitelistSources);
const app = createApp({ config, store });

app.listen(config.port, config.host, () => {
  process.stdout.write(`market-api listening on ${config.baseUrl}\n`);
});
