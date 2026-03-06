import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public catalog ui", () => {
  it("contains the directory homepage sections", () => {
    const html = readFileSync(join(process.cwd(), "src", "web", "catalog.html"), "utf8");
    expect(html).toContain("Browse Skills");
    expect(html).toContain("Search skills");
    expect(html).toContain("Recently Published");
    expect(html).toContain("Latest Audits");
  });

  it("contains the skill detail sections", () => {
    const html = readFileSync(join(process.cwd(), "src", "web", "skill-detail.html"), "utf8");
    expect(html).toContain("Skill Overview");
    expect(html).toContain("Install Command");
    expect(html).toContain("Version History");
    expect(html).toContain("Audit Evidence");
  });
});
