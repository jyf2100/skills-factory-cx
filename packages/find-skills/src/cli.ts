#!/usr/bin/env node
import { loadDotEnv } from "@skills/shared";
import { Command } from "commander";
import { addSource, listSources } from "./source.js";
import { loadCliConfig, saveCliConfig } from "./config.js";
import { installSkill, searchSkills, verifySkill } from "./install.js";

loadDotEnv();
const program = new Command();
program.name("find-skills").description("Local skills marketplace client");

program
  .command("search")
  .argument("<keyword>")
  .description("Search published skills")
  .action(async (keyword: string) => {
    const config = loadCliConfig();
    await searchSkills(config, keyword);
  });

program
  .command("install")
  .argument("<skill_ref>")
  .description("Install a signed skill from local market")
  .action(async (skillRef: string) => {
    const config = loadCliConfig();
    await installSkill(config, skillRef);
  });

program
  .command("verify")
  .argument("<skill_ref>")
  .description("Verify installed skill against registry manifest and signature")
  .action(async (skillRef: string) => {
    const config = loadCliConfig();
    await verifySkill(config, skillRef);
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

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
