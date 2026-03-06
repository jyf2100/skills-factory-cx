import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public catalog ui", () => {
  it("contains the localized directory homepage sections", () => {
    const html = readFileSync(join(process.cwd(), "src", "web", "catalog.html"), "utf8");
    expect(html).toContain("技能目录");
    expect(html).toContain("搜索技能");
    expect(html).toContain("最新发布");
    expect(html).toContain("最新审计");
    expect(html).toContain("排行榜");
    expect(html).toContain("分类");
    expect(html).toContain('/assets/theme.css');
  });

  it("contains the localized skill detail sections and rendered content slot", () => {
    const html = readFileSync(join(process.cwd(), "src", "web", "skill-detail.html"), "utf8");
    expect(html).toContain("技能概览");
    expect(html).toContain("安装命令");
    expect(html).toContain("版本历史");
    expect(html).toContain("审计证据");
    expect(html).toContain("技能内容");
    expect(html).toContain('/assets/theme.css');
  });

  it("contains the localized leaderboard, audits, and categories pages", () => {
    const leaderboardHtml = readFileSync(join(process.cwd(), "src", "web", "leaderboard.html"), "utf8");
    const auditsHtml = readFileSync(join(process.cwd(), "src", "web", "audits.html"), "utf8");
    const categoriesHtml = readFileSync(join(process.cwd(), "src", "web", "categories.html"), "utf8");

    expect(leaderboardHtml).toContain("技能排行榜");
    expect(leaderboardHtml).toContain("总榜");
    expect(leaderboardHtml).toContain("趋势");
    expect(leaderboardHtml).toContain("热门");
    expect(leaderboardHtml).toContain('/assets/theme.css');

    expect(auditsHtml).toContain("审计中心");
    expect(auditsHtml).toContain("审核状态");
    expect(auditsHtml).toContain("静态扫描");
    expect(auditsHtml).toContain("沙箱");
    expect(auditsHtml).toContain('/assets/theme.css');

    expect(categoriesHtml).toContain("按分类浏览");
    expect(categoriesHtml).toContain("重点分类");
    expect(categoriesHtml).toContain("分类技能");
    expect(categoriesHtml).toContain('/assets/theme.css');
  });

  it("contains localized independent category and audit detail pages", () => {
    const categoryDetailHtml = readFileSync(join(process.cwd(), "src", "web", "category-detail.html"), "utf8");
    const auditDetailHtml = readFileSync(join(process.cwd(), "src", "web", "audit-detail.html"), "utf8");
    const auditVersionDetailHtml = readFileSync(join(process.cwd(), "src", "web", "audit-version-detail.html"), "utf8");

    expect(categoryDetailHtml).toContain("分类概览");
    expect(categoryDetailHtml).toContain("分类技能");
    expect(categoryDetailHtml).toContain("相关标签");
    expect(categoryDetailHtml).toContain("排序方式");
    expect(categoryDetailHtml).toContain("筛选技能");
    expect(categoryDetailHtml).toContain('/assets/theme.css');

    expect(auditDetailHtml).toContain("审计详情");
    expect(auditDetailHtml).toContain("最新结论");
    expect(auditDetailHtml).toContain("版本审计时间线");
    expect(auditDetailHtml).toContain("证据摘要");
    expect(auditDetailHtml).toContain('/assets/theme.css');

    expect(auditVersionDetailHtml).toContain("版本审计详情");
    expect(auditVersionDetailHtml).toContain("结论快照");
    expect(auditVersionDetailHtml).toContain("证据摘要");
    expect(auditVersionDetailHtml).toContain('/assets/theme.css');
  });
});
