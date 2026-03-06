import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as tar from "tar";
import {
  type AttestationEnvelope,
  type IngestRecord,
  type InstallManifest,
  type PublishedSkill,
  type ReviewDecision,
  ensureEd25519Keypair,
  sha256Buffer,
  signHashHex
} from "@skills/shared";
import { copyDir, writeJson } from "../fs-util.js";
import type { AppConfig } from "../config.js";
import { withOutboundProxyEnv } from "../proxy.js";

function ensureRepoRoot(repoPath: string): void {
  mkdirSync(repoPath, { recursive: true });
  try {
    execFileSync("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  } catch {
    execFileSync("git", ["-C", repoPath, "init"], { stdio: "ignore" });
  }
}

function ensureGitIdentity(repoPath: string): void {
  try {
    execFileSync("git", ["-C", repoPath, "config", "user.name"], { stdio: "ignore" });
  } catch {
    execFileSync("git", ["-C", repoPath, "config", "user.name", "skills-market"], { stdio: "ignore" });
  }

  try {
    execFileSync("git", ["-C", repoPath, "config", "user.email"], { stdio: "ignore" });
  } catch {
    execFileSync("git", ["-C", repoPath, "config", "user.email", "skills-market@local"], { stdio: "ignore" });
  }
}

function hasWorktreeChanges(repoPath: string): boolean {
  const output = execFileSync("git", ["-C", repoPath, "status", "--porcelain"], { encoding: "utf8" });
  return output.trim().length > 0;
}

function formatExecError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const withStderr = error as Error & { stderr?: Buffer | string; stdout?: Buffer | string };
  const stderr = typeof withStderr.stderr === "string" ? withStderr.stderr : withStderr.stderr?.toString("utf8") ?? "";
  const stdout = typeof withStderr.stdout === "string" ? withStderr.stdout : withStderr.stdout?.toString("utf8") ?? "";
  return stderr.trim() || stdout.trim() || error.message;
}

function gitCommit(repoPath: string, message: string): void {
  execFileSync("git", ["-C", repoPath, "add", "."], { stdio: "ignore" });
  ensureGitIdentity(repoPath);

  if (!hasWorktreeChanges(repoPath)) {
    return;
  }

  try {
    execFileSync("git", ["-C", repoPath, "commit", "-m", message], { stdio: "pipe" });
  } catch (error) {
    if (!hasWorktreeChanges(repoPath)) {
      return;
    }
    throw new Error(`git commit failed: ${formatExecError(error)}`);
  }
}

function ensureBranch(repoPath: string, branch: string): void {
  try {
    execFileSync("git", ["-C", repoPath, "checkout", branch], { stdio: "ignore" });
  } catch {
    execFileSync("git", ["-C", repoPath, "checkout", "-b", branch], { stdio: "ignore" });
  }
}

function configureRemote(repoPath: string, remoteUrl: string): void {
  let hasOrigin = false;
  try {
    execFileSync("git", ["-C", repoPath, "remote", "get-url", "origin"], { stdio: "ignore" });
    hasOrigin = true;
  } catch {
    hasOrigin = false;
  }
  if (hasOrigin) {
    execFileSync("git", ["-C", repoPath, "remote", "set-url", "origin", remoteUrl], { stdio: "ignore" });
  } else {
    execFileSync("git", ["-C", repoPath, "remote", "add", "origin", remoteUrl], { stdio: "ignore" });
  }
}

function pushToRemote(repoPath: string, branch: string): void {
  execFileSync("git", ["-C", repoPath, "push", "-u", "origin", branch], {
    stdio: "pipe",
    env: withOutboundProxyEnv(process.env)
  });
}

export interface PublishInput {
  ingest: IngestRecord;
  approval: ReviewDecision;
  config: AppConfig;
}

export async function publishSkill(input: PublishInput): Promise<PublishedSkill> {
  ensureRepoRoot(input.config.localSkillsRepo);
  ensureBranch(input.config.localSkillsRepo, input.config.gitPushBranch);
  ensureEd25519Keypair(input.config.signingPrivateKeyPath, input.config.signingPublicKeyPath);

  const { ingest } = input;

  const skillDir = join(input.config.localSkillsRepo, "skills", ingest.skill_id, ingest.version);
  copyDir(ingest.workspace_path, skillDir);

  const packageDir = join(input.config.localSkillsRepo, "packages", ingest.skill_id);
  mkdirSync(packageDir, { recursive: true });
  const packagePath = join(packageDir, `${ingest.version}.tgz`);

  await tar.create(
    {
      cwd: skillDir,
      gzip: true,
      file: packagePath
    },
    ["."]
  );

  const packageBuffer = readFileSync(packagePath);
  const packageSha256 = sha256Buffer(packageBuffer);
  const packageUrl = packageUrlForSkill(input.config, ingest.skill_id, ingest.version);

  const privatePem = readFileSync(input.config.signingPrivateKeyPath, "utf8");
  const signature = signHashHex(packageSha256, privatePem);

  const installManifest: InstallManifest = {
    skill_id: ingest.skill_id,
    version: ingest.version,
    package_url:
      packageUrl ??
      `${input.config.baseUrl}/api/v1/packages/${encodeURIComponent(ingest.skill_id)}/${encodeURIComponent(ingest.version)}`,
    package_sha256: packageSha256,
    signature,
    public_key_id: "market-ed25519-v1",
    source_url: ingest.source_url,
    published_at: new Date().toISOString()
  };

  const metadataPath = join(input.config.localSkillsRepo, "metadata", ingest.skill_id, `${ingest.version}.json`);
  const record = {
    skill_id: ingest.skill_id,
    version: ingest.version,
    source_url: ingest.source_url,
    source_commit: ingest.source_commit,
    hash_sha256: packageSha256,
    license: "UNKNOWN",
    risk_level: ingest.risk_level,
    published_at: installManifest.published_at
  };

  const attestation: AttestationEnvelope = {
    ingest_id: ingest.id,
    scan_issues: ingest.scan_issues,
    sandbox_result: ingest.sandbox_result,
    approval: input.approval,
    signature,
    key_id: installManifest.public_key_id
  };

  const attestationPath = join(input.config.localSkillsRepo, "attestations", ingest.skill_id, `${ingest.version}.json`);
  const signaturePath = join(input.config.localSkillsRepo, "signatures", ingest.skill_id, `${ingest.version}.sig`);
  const installPath = join(input.config.localSkillsRepo, "install-manifests", ingest.skill_id, `${ingest.version}.json`);

  writeJson(metadataPath, record);
  writeJson(attestationPath, attestation);
  writeJson(installPath, installManifest);
  mkdirSync(dirname(signaturePath), { recursive: true });
  writeFileSync(signaturePath, signature, "utf8");

  const indexPath = join(input.config.localSkillsRepo, "index", "skills-index.json");
  mkdirSync(dirname(indexPath), { recursive: true });
  let index: Array<{ skill_id: string; versions: string[] }> = [];
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8")) as Array<{ skill_id: string; versions: string[] }>;
  } catch {
    index = [];
  }
  const existing = index.find((item) => item.skill_id === ingest.skill_id);
  if (!existing) {
    index.push({ skill_id: ingest.skill_id, versions: [ingest.version] });
  } else if (!existing.versions.includes(ingest.version)) {
    existing.versions.push(ingest.version);
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

  gitCommit(input.config.localSkillsRepo, `publish ${ingest.skill_id}@${ingest.version}`);
  if (input.config.gitRemoteUrl) {
    configureRemote(input.config.localSkillsRepo, input.config.gitRemoteUrl);
    pushToRemote(input.config.localSkillsRepo, input.config.gitPushBranch);
  }

  return {
    record,
    install: installManifest,
    attestation_path: attestationPath,
    metadata_path: metadataPath,
    package_path: packagePath
  };
}

function packageUrlForSkill(config: AppConfig, skillId: string, version: string): string | undefined {
  if (!config.gitlabRawBaseUrl) {
    return undefined;
  }
  const base = config.gitlabRawBaseUrl.replace(/\/+$/, "");
  return `${base}/packages/${encodeURIComponent(skillId)}/${encodeURIComponent(version)}.tgz`;
}
