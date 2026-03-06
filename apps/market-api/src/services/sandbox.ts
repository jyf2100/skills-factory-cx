import { execFileSync } from "node:child_process";
import { type SandboxResult } from "@skills/shared";

type SandboxRuntime = "podman" | "docker" | "none";

function hasBinary(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runtimeAvailable(runtime: Exclude<SandboxRuntime, "none">): boolean {
  if (!hasBinary(runtime)) {
    return false;
  }
  try {
    execFileSync(runtime, ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function resolveRuntime(): SandboxRuntime {
  const override = (process.env.SANDBOX_RUNTIME ?? "").trim().toLowerCase();
  if (override === "none") {
    return "none";
  }
  if (override === "podman" || override === "docker") {
    return runtimeAvailable(override) ? override : "none";
  }

  if (runtimeAvailable("podman")) {
    return "podman";
  }
  if (runtimeAvailable("docker")) {
    return "docker";
  }
  return "none";
}

export function runSandboxCheck(workspacePath: string): SandboxResult {
  const runtime = resolveRuntime();
  if (runtime === "none") {
    return {
      ran: false,
      runtime,
      ok: false,
      output: sanitizeOutput("No podman/docker found; sandbox execution skipped.")
    };
  }

  try {
    const output = execFileSync(
      runtime,
      [
        "run",
        "--rm",
        "--network=none",
        "--read-only",
        "-v",
        `${workspacePath}:/skill:ro`,
        "alpine:3.20",
        "sh",
        "-lc",
        "test -f /skill/SKILL.md && ls -la /skill"
      ],
      { encoding: "utf8" }
    );

    return { ran: true, runtime, ok: true, output: sanitizeOutput(output) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ran: true, runtime, ok: false, output: sanitizeOutput(message) };
  }
}

function sanitizeOutput(input: string): string {
  const withoutControls = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const normalizedWhitespace = withoutControls.replace(/\s+/g, " ");
  return normalizedWhitespace.trim().slice(0, 4000);
}
