import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const abs = join(current, entry);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        if (entry === ".git" || entry === "node_modules") {
          continue;
        }
        stack.push(abs);
      } else {
        out.push(abs);
      }
    }
  }
  return out;
}

export function findFile(root: string, fileName: string): string | undefined {
  return walkFiles(root).find((path) => path.endsWith(`/${fileName}`));
}

export function readTextSafe(filePath: string): string {
  const buffer = readFileSync(filePath);
  if (buffer.length > 2_000_000) {
    return "";
  }
  return buffer.toString("utf8");
}

export function dirSha256(root: string): string {
  const hash = createHash("sha256");
  const files = walkFiles(root).sort();
  for (const abs of files) {
    hash.update(relative(root, abs));
    hash.update(readFileSync(abs));
  }
  return hash.digest("hex");
}

export function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

export function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}
