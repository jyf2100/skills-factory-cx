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
    expect(html).toContain("Leaderboard");
    expect(html).toContain("Categories");
  });

  it("contains the skill detail sections", () => {
    const html = readFileSync(join(process.cwd(), "src", "web", "skill-detail.html"), "utf8");
    expect(html).toContain("Skill Overview");
    expect(html).toContain("Install Command");
    expect(html).toContain("Version History");
    expect(html).toContain("Audit Evidence");
  });

  it("contains the leaderboard, audits, and categories pages", () => {
    const leaderboardHtml = readFileSync(join(process.cwd(), "src", "web", "leaderboard.html"), "utf8");
    const auditsHtml = readFileSync(join(process.cwd(), "src", "web", "audits.html"), "utf8");
    const categoriesHtml = readFileSync(join(process.cwd(), "src", "web", "categories.html"), "utf8");

    expect(leaderboardHtml).toContain("Skills Leaderboard");
    expect(leaderboardHtml).toContain("All Time");
    expect(leaderboardHtml).toContain("Trending");
    expect(leaderboardHtml).toContain("Hot");

    expect(auditsHtml).toContain("Audit Center");
    expect(auditsHtml).toContain("Review Status");
    expect(auditsHtml).toContain("Static Scan");
    expect(auditsHtml).toContain("Sandbox");

    expect(categoriesHtml).toContain("Browse by Category");
    expect(categoriesHtml).toContain("Featured Categories");
    expect(categoriesHtml).toContain("Category Skills");
  });
});
