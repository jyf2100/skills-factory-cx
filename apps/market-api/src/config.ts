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
}

export function loadConfig(): AppConfig {
  const dataDir = resolve(env("DATA_DIR", ".data"));
  return {
    port: Number(env("MARKET_API_PORT", "4310")),
    host: env("MARKET_API_HOST", "127.0.0.1"),
    baseUrl: env("MARKET_API_BASE_URL", `http://127.0.0.1:4310`),
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
    gitlabRawBaseUrl: envOptional("GITLAB_RAW_BASE_URL")
  };
}
