import { resolve } from "node:path";

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envOptional(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export interface AppConfig {
  port: number;
  host: string;
  baseUrl: string;
  dataDir: string;
  localSkillsRepo: string;
  whitelistSources: string[];
  signingPrivateKeyPath: string;
  signingPublicKeyPath: string;
  gitRemoteUrl?: string;
  gitPushBranch: string;
  gitlabRawBaseUrl?: string;
  gitlabFetchBaseUrl?: string;
  catalogBackend: "gitlab" | "postgres";
  database: DatabaseConfig;
}

export function loadConfig(): AppConfig {
  const dataDir = resolve(env("DATA_DIR", ".data"));
  return {
    port: Number(env("MARKET_API_PORT", "4311")),
    host: env("MARKET_API_HOST", "127.0.0.1"),
    baseUrl: env("MARKET_API_BASE_URL", `http://127.0.0.1:4311`),
    dataDir,
    localSkillsRepo: resolve(env("LOCAL_SKILLS_REPO", `${dataDir}/local-skills-repo`)),
    whitelistSources: env("WHITELIST_SOURCES", "https://github.com,https://gitlab.com,https://skills.sh")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    signingPrivateKeyPath: resolve(env("SIGNING_PRIVATE_KEY_PATH", `${dataDir}/keys/market_private.pem`)),
    signingPublicKeyPath: resolve(env("SIGNING_PUBLIC_KEY_PATH", `${dataDir}/keys/market_public.pem`)),
    gitRemoteUrl: envOptional("GIT_REMOTE_URL"),
    gitPushBranch: env("GIT_PUSH_BRANCH", "main"),
    gitlabRawBaseUrl: envOptional("GITLAB_RAW_BASE_URL"),
    gitlabFetchBaseUrl: envOptional("GITLAB_FETCH_BASE_URL"),
    catalogBackend: env("CATALOG_BACKEND", "gitlab") === "postgres" ? "postgres" : "gitlab",
    database: {
      host: env("POSTGRES_HOST", "127.0.0.1"),
      port: Number(env("POSTGRES_PORT", "5432")),
      user: env("POSTGRES_USER", "skills"),
      password: envOptional("POSTGRES_PASSWORD"),
      database: env("POSTGRES_DB", "skills_market")
    }
  };
}
