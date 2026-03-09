import { describe, expect, it } from "vitest";
import { buildCatalogSearchUrl, parseRef, resolveSourceUrl, resolveTarget } from "./install.js";

describe("install helpers", () => {
  it("builds catalog search url with query", () => {
    expect(buildCatalogSearchUrl("http://127.0.0.1:4311", "vercel")).toBe(
      "http://127.0.0.1:4311/api/v1/catalog/skills?query=vercel"
    );
  });

  it("uses override source when provided", () => {
    expect(resolveSourceUrl({ sources: ["http://a"], install_dir: "/tmp/skills" }, "http://b/")).toBe("http://b");
  });

  it("parses legacy skill reference", () => {
    expect(parseRef("demo-skill@1.2.3")).toEqual({ skillId: "demo-skill", version: "1.2.3" });
  });

  it("supports local command target args", () => {
    expect(resolveTarget("demo-skill", "1.2.3")).toEqual({ skillId: "demo-skill", version: "1.2.3" });
  });
});
