import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findEnvFile(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function parseValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadDotEnv(startDir = process.cwd()): void {
  const envPath = findEnvFile(startDir);
  if (!envPath) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = parseValue(line.slice(index + 1));
  }
}
