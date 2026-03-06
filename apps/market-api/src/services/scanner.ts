import { type RiskLevel, type ScanIssue } from "@skills/shared";
import { readTextSafe, walkFiles } from "../fs-util.js";

const rules: Array<{ regex: RegExp; severity: RiskLevel; rule: string; message: string }> = [
  { regex: /rm\s+-rf\s+\//i, severity: "critical", rule: "dangerous-rm", message: "Detected destructive rm command." },
  { regex: /curl\s+.*\|\s*(bash|sh)/i, severity: "high", rule: "curl-pipe-shell", message: "Detected pipe-to-shell pattern." },
  { regex: /wget\s+.*\|\s*(bash|sh)/i, severity: "high", rule: "wget-pipe-shell", message: "Detected pipe-to-shell pattern." },
  { regex: /chmod\s+777/i, severity: "medium", rule: "permissive-chmod", message: "Detected permissive file mode change." },
  { regex: /nc\s+-e/i, severity: "critical", rule: "reverse-shell", message: "Detected reverse shell style command." },
  { regex: /eval\s*\(/i, severity: "medium", rule: "eval-usage", message: "Detected eval usage; manual review required." }
];

const rank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export interface ScanSummary {
  issues: ScanIssue[];
  riskLevel: RiskLevel;
}

export function runStaticScan(root: string): ScanSummary {
  const issues: ScanIssue[] = [];

  for (const file of walkFiles(root)) {
    const text = readTextSafe(file);
    if (!text) {
      continue;
    }

    for (const rule of rules) {
      if (rule.regex.test(text)) {
        issues.push({
          rule: rule.rule,
          severity: rule.severity,
          message: rule.message,
          file
        });
      }
    }
  }

  let riskLevel: RiskLevel = "low";
  for (const issue of issues) {
    if (rank[issue.severity] > rank[riskLevel]) {
      riskLevel = issue.severity;
    }
  }

  return { issues, riskLevel };
}
