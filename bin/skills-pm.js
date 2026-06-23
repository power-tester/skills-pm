#!/usr/bin/env node
/**
 * Consumer and maintainer CLI for @pramodyadav027/skills-pm.
 *
 * Consumer commands (run from any project):
 *   npx @pramodyadav027/skills-pm install [--ref <branch>]   install / update all skills
 *   npx @pramodyadav027/skills-pm status  [--ref <branch>]   show installed vs manifest
 *   npx @pramodyadav027/skills-pm list                       list installed skills
 *   npx @pramodyadav027/skills-pm remove                     remove skills
 *
 * Maintainer commands (run inside this repo):
 *   npx @pramodyadav027/skills-pm fetch
 */

const { PKG_NAME, AGENT } = require("../lib/config");
const { cmdInstall } = require("../lib/commands/install");
const { cmdFetch } = require("../lib/commands/fetch");
const { cmdStatus } = require("../lib/commands/status");
const { cmdReport } = require("../lib/commands/report");
const { run } = require("../lib/utils/runner");

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || "install";
  const refIdx = argv.indexOf("--ref");
  const ref = refIdx === -1 ? "main" : argv[refIdx + 1];

  switch (cmd) {
    case "install":
    case "update":
      await cmdInstall(ref);
      break;
    case "status":
      await cmdStatus(ref);
      break;
    case "report":
      await cmdReport(ref);
      break;
    case "fetch":
      await cmdFetch();
      break;
    case "list":
      run(["skills", "list", "-g", "-a", AGENT]);
      break;
    case "remove":
      run(["skills", "remove", "-g", "-y"]);
      break;
    case "help":
    case "--help":
      console.log(
        `Usage:\n` +
          `  npx ${PKG_NAME} install [--ref <branch>]   install skills from upstream repos\n` +
          `  npx ${PKG_NAME} update  [--ref <branch>]   update installed skills\n` +
          `  npx ${PKG_NAME} status  [--ref <branch>]   show installed vs manifest skills\n` +
          `  npx ${PKG_NAME} list                       list installed skills\n` +
          `  npx ${PKG_NAME} remove                     remove skills\n` +
          `  npx ${PKG_NAME} report  [--ref <branch>]   print compliance snapshot (JSON)\n` +
          `  npx ${PKG_NAME} fetch                      pull SKILL.md files locally for review`
      );
      break;
    default:
      console.error(`Unknown command: ${cmd}. Run with --help for usage.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
