import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn()
}));

const childProcess = await import("node:child_process");

describe("sandbox runtime resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SANDBOX_RUNTIME;
  });

  afterEach(() => {
    delete process.env.SANDBOX_RUNTIME;
  });

  it("falls back to docker when podman info fails", async () => {
    const execFileSync = childProcess.execFileSync as unknown as ReturnType<typeof vi.fn>;
    execFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") {
        return args[0];
      }
      if (cmd === "podman") {
        throw new Error("podman not running");
      }
      if (cmd === "docker") {
        return "ok";
      }
      return "ok";
    });

    vi.resetModules();
    const { resolveRuntime } = await import("../src/services/sandbox.js");

    expect(resolveRuntime()).toBe("docker");
  });

  it("respects SANDBOX_RUNTIME=none override", async () => {
    process.env.SANDBOX_RUNTIME = "none";

    vi.resetModules();
    const { resolveRuntime } = await import("../src/services/sandbox.js");

    expect(resolveRuntime()).toBe("none");
  });
});
