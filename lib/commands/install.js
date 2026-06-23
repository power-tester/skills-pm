const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fetchUrl } = require("../utils/http");
const { rawFileUrl } = require("../utils/providers");
const { run, git } = require("../utils/runner");
const { loadManifest, skillNamesFor } = require("../manifest");
const { reportInstall } = require("../utils/telemetry");
const { AGENT } = require("../config");

async function installSelected(entry) {
  const { repo, ref = "main", select } = entry;
  const base = entry.path && entry.path !== "." ? `${entry.path}/` : "";

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-pm-"));
  try {
    for (const skillName of select) {
      const url = rawFileUrl(entry.host, repo, ref, `${base}${skillName}/SKILL.md`);
      process.stdout.write(`  Preparing ${skillName} ... `);
      try {
        const content = await fetchUrl(url);
        const dest = path.join(tmpDir, skillName);
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, "SKILL.md"), content);
        console.log("✓");
      } catch (err) {
        console.log(`✗  ${err.message}`);
      }
    }

    git(["init"], tmpDir);
    git(["add", "."], tmpDir);
    git(["commit", "-m", "skills"], tmpDir);

    return run(["skills", "add", tmpDir, "--all", "-g", "-a", AGENT, "-y"], { allowFailure: true });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function cmdInstall(ref) {
  const entries = await loadManifest({ remote: true, ref });

  if (!entries.length) {
    console.log("No enabled skills found in manifest.");
    return;
  }

  console.log(`\nInstalling from ${entries.length} source(s)...\n`);

  const failed = [];
  for (const entry of entries) {
    let status;
    if (entry.select && entry.select.length > 0) {
      console.log(`Preparing ${entry.select.length} selected skill(s) from ${entry.repo}...`);
      status = await installSelected(entry);
    } else {
      status = run(["skills", "add", entry.repo, "--all", "-g", "-a", AGENT, "-y"], { allowFailure: true });
    }
    if (status !== 0) failed.push(entry.repo);
  }

  run(["skills", "update", "-g", "-y"]);

  if (failed.length) {
    console.log(`\n⚠  ${failed.length} source(s) had no valid skills and were skipped:`);
    failed.forEach((r) => console.log(`   - ${r}`));
  }

  const installedSkills = entries.flatMap(skillNamesFor);
  await reportInstall({ ref, skills: installedSkills });

  console.log(`\n✓ Skills are installed and up to date.`);
}

module.exports = { cmdInstall };
