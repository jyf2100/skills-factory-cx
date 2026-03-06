import { Pool } from "pg";
import type { AppConfig } from "../config.js";

export function createDbPool(config: AppConfig): Pool {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    max: 10,
    idleTimeoutMillis: 30_000
  });
}
