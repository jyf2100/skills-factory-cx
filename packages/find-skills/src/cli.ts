#!/usr/bin/env node
import { basename } from "node:path";
import { loadDotEnv } from "@skills/shared";
import { Command } from "commander";
import { addSource, listSources } from "./source.js";
import { loadCliConfig, saveCliConfig } from "./config.js";
import { installSkill, searchSkills, verifySkill } from "./install.js";

loadDotEnv();

const invokedAs = basename(process.argv[1] ?? "find-skills");

if (invokedAs === "local-find-skills") {
  const program = new Command();
  program.name("local-find-skills").description("Search skills from a local market source");
  program
    .requiredOption("--from <url>", "Local market base URL")
    .argument("[keyword]", "Optional search keyword")
    .action(async (keyword: string | undefined, options: { from: string }) => {
      const config = loadCliConfig();
      await searchSkills(config, keyword ?? "", options.from);
    });

  program.parseAsync(process.argv).catch(handleCliError);
} else if (invokedAs === "local-install") {
  const program = new Command();
  program.name("local-install").description("Install a skill from a local market source");
  program
    .requiredOption("--from <url>", "Local market base URL")
    .argument("<skill>")
    .argument("<version>")
    .action(async (skill: string, version: string, options: { from: string }) => {
      const config = loadCliConfig();
      await installSkill(config, skill, version, options.from);
    });

  program.parseAsync(process.argv).catch(handleCliError);
} else if (invokedAs === "local-verify") {
  const program = new Command();
  program.name("local-verify").description("Verify an installed skill against a local market source");
  program
    .requiredOption("--from <url>", "Local market base URL")
    .argument("<skill>")
    .argument("<version>")
    .action(async (skill: string, version: string, options: { from: string }) => {
      const config = loadCliConfig();
      await verifySkill(config, skill, version, options.from);
    });

  program.parseAsync(process.argv).catch(handleCliError);
} else {
  const program = new Command();
  program.name("find-skills").description("Local skills marketplace client");

  program
    .command("search")
    .option("--from <url>", "Local market base URL override")
    .argument("[keyword]", "Optional search keyword")
    .description("Search published skills")
    .action(async (keyword: string | undefined, options: { from?: string }) => {
      const config = loadCliConfig();
      await searchSkills(config, keyword ?? "", options.from);
    });

  program
    .command("install")
    .option("--from <url>", "Local market base URL override")
    .argument("<skill_ref>")
    .description("Install a signed skill from local market")
    .action(async (skillRef: string, options: { from?: string }) => {
      const config = loadCliConfig();
      await installSkill(config, skillRef, undefined, options.from);
    });

  program
    .command("verify")
    .option("--from <url>", "Local market base URL override")
    .argument("<skill_ref>")
    .description("Verify installed skill against registry manifest and signature")
    .action(async (skillRef: string, options: { from?: string }) => {
      const config = loadCliConfig();
      await verifySkill(config, skillRef, undefined, options.from);
    });

  const source = program.command("source").description("Manage market API sources");
  source
    .command("add")
    .argument("<url>")
    .action((url: string) => {
      const config = loadCliConfig();
      const next = addSource(config, url);
      saveCliConfig(next);
      process.stdout.write(`Added source ${url}\n`);
    });

  source.command("list").action(() => {
    const config = loadCliConfig();
    listSources(config);
  });

  program.parseAsync(process.argv).catch(handleCliError);
}

function handleCliError(error: unknown): never {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
