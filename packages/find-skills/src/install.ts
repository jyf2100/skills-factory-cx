import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as tar from "tar";
import { sha256Buffer, verifyHashSignature, type InstallManifest } from "@skills/shared";
import type { CliConfig } from "./config.js";
import { jsonGet } from "./http.js";

function parseRef(ref: string): { skillId: string; version: string } {
  const [skillId, version] = ref.split("@");
  if (!skillId || !version) {
    throw new Error("skill reference must be <skill_id>@<version>");
  }
  return { skillId, version };
}

export async function searchSkills(config: CliConfig, query: string): Promise<void> {
  const source = config.sources[0];
  const payload = await jsonGet<{ items: Array<{ record: { skill_id: string; version: string; risk_level: string; source_url: string } }> }>(
    `${source}/api/v1/skills?query=${encodeURIComponent(query)}`
  );
  if (payload.items.length === 0) {
    process.stdout.write("No skills found.\n");
    return;
  }

  for (const item of payload.items) {
    process.stdout.write(`${item.record.skill_id}@${item.record.version} [risk=${item.record.risk_level}] ${item.record.source_url}\n`);
  }
}

export async function installSkill(config: CliConfig, ref: string): Promise<void> {
  const { skillId, version } = parseRef(ref);
  const source = config.sources[0];

  const manifest = await jsonGet<InstallManifest>(
    `${source}/api/v1/install/${encodeURIComponent(skillId)}/${encodeURIComponent(version)}`
  );

  const packageResponse = await fetch(manifest.package_url);
  if (!packageResponse.ok) {
    throw new Error(`failed to download package: ${packageResponse.status}`);
  }
  const packageBuffer = Buffer.from(await packageResponse.arrayBuffer());

  const sha = sha256Buffer(packageBuffer);
  if (sha !== manifest.package_sha256) {
    throw new Error(`hash mismatch for ${skillId}@${version}`);
  }

  const publicKey = await jsonGet<{ key_id: string; pem: string }>(`${source}/api/v1/public-key`);
  if (publicKey.key_id !== manifest.public_key_id) {
    throw new Error(`unexpected key id ${publicKey.key_id}`);
  }

  const signatureOk = verifyHashSignature(sha, manifest.signature, publicKey.pem);
  if (!signatureOk) {
    throw new Error(`signature verification failed for ${skillId}@${version}`);
  }

  const cacheDir = join(config.install_dir, ".cache", skillId);
  mkdirSync(cacheDir, { recursive: true });
  const archivePath = join(cacheDir, `${version}.tgz`);
  writeFileSync(archivePath, packageBuffer);

  const targetDir = join(config.install_dir, skillId, version);
  mkdirSync(targetDir, { recursive: true });
  await tar.extract({ file: archivePath, cwd: targetDir });

  const manifestPath = join(targetDir, ".install-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  await fetch(`${source}/api/v1/install-log/${encodeURIComponent(skillId)}/${encodeURIComponent(version)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: process.env.USER ?? "unknown", host: process.env.HOSTNAME ?? "localhost" })
  });

  process.stdout.write(`Installed ${skillId}@${version} to ${targetDir}\n`);
}

export async function verifySkill(config: CliConfig, ref: string): Promise<void> {
  const { skillId, version } = parseRef(ref);
  const source = config.sources[0];
  const installDir = join(config.install_dir, skillId, version, ".install-manifest.json");

  const installed = JSON.parse(readFileSync(installDir, "utf8")) as InstallManifest;
  const latest = await jsonGet<InstallManifest>(
    `${source}/api/v1/install/${encodeURIComponent(skillId)}/${encodeURIComponent(version)}`
  );

  if (installed.package_sha256 !== latest.package_sha256) {
    throw new Error(`installed hash differs from registry manifest for ${skillId}@${version}`);
  }

  const publicKey = await jsonGet<{ key_id: string; pem: string }>(`${source}/api/v1/public-key`);
  const ok = verifyHashSignature(latest.package_sha256, latest.signature, publicKey.pem);
  if (!ok) {
    throw new Error(`current signature does not verify for ${skillId}@${version}`);
  }

  process.stdout.write(`Verified ${skillId}@${version}\n`);
}
