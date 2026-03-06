import type { CliConfig } from "./config.js";

export function addSource(config: CliConfig, sourceUrl: string): CliConfig {
  if (!config.sources.includes(sourceUrl)) {
    config.sources.push(sourceUrl);
  }
  return config;
}

export function listSources(config: CliConfig): void {
  for (const source of config.sources) {
    process.stdout.write(`${source}\n`);
  }
}
