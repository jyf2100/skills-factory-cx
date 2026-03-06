import { afterEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock
}));

describe("source search", () => {
  afterEach(() => {
    execFileSyncMock.mockReset();
  });

  it("returns GitLab candidates for whitelisted GitLab sources", async () => {
    execFileSyncMock.mockReturnValueOnce(
      JSON.stringify([
        {
          web_url: "https://gitlab.com/acme/sample-skill",
          description: "sample skill repo",
          path_with_namespace: "acme/sample-skill"
        }
      ])
    );

    const { searchWhitelistedSources } = await import("../src/services/source-search.js");
    const candidates = await searchWhitelistedSources("sample", ["https://gitlab.com"]);

    expect(candidates).toEqual([
      expect.objectContaining({
        source_url: "https://gitlab.com/acme/sample-skill",
        provider: "gitlab"
      })
    ]);
  });
});
