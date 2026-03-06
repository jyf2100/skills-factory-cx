import { execFileSync } from "node:child_process";
import { baseCurlArgs, withOutboundProxyEnv } from "../proxy.js";

export interface SourceCandidate {
  source_url: string;
  description: string;
  provider: string;
}

interface GitLabProject {
  web_url?: string;
  description?: string | null;
  path_with_namespace?: string;
}

export async function searchWhitelistedSources(query: string, whitelist: string[]): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();

  for (const base of whitelist) {
    const host = new URL(base).host;
    if (host === "github.com") {
      const fromGitHub = await searchGitHub(query);
      appendCandidates(candidates, seen, fromGitHub);
    } else if (host === "skills.sh") {
      const fromSkills = await searchSkillsSh(query);
      appendCandidates(candidates, seen, fromSkills);
    } else if (host === "gitlab.com") {
      const fromGitLab = await searchGitLab(query, base);
      appendCandidates(candidates, seen, fromGitLab);
    }
  }

  return candidates.slice(0, 50);
}

async function searchGitHub(query: string): Promise<SourceCandidate[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(`${query} SKILL.md`)}&per_page=10`;
  try {
    const payload = curlJson<{ items?: Array<{ html_url: string; description: string | null }> }>([
      ...baseCurlArgs(),
      "-H",
      "Accept: application/vnd.github+json",
      url
    ]);
    if (!payload) {
      return [];
    }
    return (payload.items ?? []).map((item) => ({
      source_url: item.html_url,
      description: item.description ?? "",
      provider: "github"
    }));
  } catch {
    return [];
  }
}

async function searchGitLab(query: string, base: string): Promise<SourceCandidate[]> {
  const apiBase = base.replace(/\/+$/, "");
  const url = `${apiBase}/api/v4/projects?search=${encodeURIComponent(query)}&simple=true&per_page=10`;
  try {
    const payload = curlJson<GitLabProject[]>([...baseCurlArgs(), url]);
    if (!payload) {
      return [];
    }
    return payload
      .filter((item) => item.web_url)
      .map((item) => ({
        source_url: item.web_url!,
        description: item.description ?? item.path_with_namespace ?? "",
        provider: "gitlab"
      }));
  } catch {
    return [];
  }
}

async function searchSkillsSh(query: string): Promise<SourceCandidate[]> {
  const html = curlText([...baseCurlArgs(), "https://skills.sh"]);
  if (!html) {
    return [];
  }

  const regex = /href="\/([^\/#?]+)\/([^\/#?]+)\/([^\/#?]+)"/g;
  const q = query.toLowerCase();
  const out: SourceCandidate[] = [];
  const seenRepo = new Set<string>();
  let match: RegExpExecArray | null = regex.exec(html);
  while (match) {
    const owner = match[1];
    const repo = match[2];
    const skillId = match[3];
    const marker = `${owner}/${repo}/${skillId}`.toLowerCase();
    if (
      owner !== "agents" &&
      owner !== "_next" &&
      repo !== "static" &&
      (marker.includes(q) || skillId.toLowerCase().includes(q))
    ) {
      const sourceUrl = `https://github.com/${owner}/${repo}.git`;
      if (!seenRepo.has(sourceUrl)) {
        seenRepo.add(sourceUrl);
        out.push({
          source_url: sourceUrl,
          description: `skill:${skillId} source:${owner}/${repo}`,
          provider: "skills.sh"
        });
      }
    }
    match = regex.exec(html);
  }

  return out.slice(0, 30);
}

function appendCandidates(target: SourceCandidate[], seen: Set<string>, incoming: SourceCandidate[]): void {
  for (const item of incoming) {
    if (seen.has(item.source_url)) {
      continue;
    }
    seen.add(item.source_url);
    target.push(item);
  }
}

function curlJson<T>(args: string[]): T | null {
  const output = curlText(args);
  if (!output) {
    return null;
  }

  try {
    return JSON.parse(output) as T;
  } catch {
    return null;
  }
}

function curlText(args: string[]): string | null {
  try {
    return execFileSync("curl", args, {
      encoding: "utf8",
      env: withOutboundProxyEnv(process.env),
      maxBuffer: 10 * 1024 * 1024
    });
  } catch {
    return null;
  }
}
