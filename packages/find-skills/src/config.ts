import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
  sources: string[];
  install_dir: string;
}

function configPath(): string {
  return join(homedir(), ".find-skills", "config.json");
}

export function loadCliConfig(): CliConfig {
  const path = configPath();
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CliConfig;
  } catch {
    const defaultConfig: CliConfig = {
      sources: [process.env.MARKET_API_BASE_URL ?? "http://127.0.0.1:4310"],
      install_dir: process.env.FIND_SKILLS_INSTALL_DIR ?? join(homedir(), ".local", "share", "find-skills", "skills")
    };
    mkdirSync(join(homedir(), ".find-skills"), { recursive: true });
    writeFileSync(path, JSON.stringify(defaultConfig, null, 2), "utf8");
    return defaultConfig;
  }
}

export function saveCliConfig(next: CliConfig): void {
  const path = configPath();
  mkdirSync(join(homedir(), ".find-skills"), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
}
