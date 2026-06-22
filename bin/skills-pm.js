#!/usr/bin/env node
/**
 * Consumer and maintainer CLI for @pramodyadav027/skills-pm.
 *
 * Consumer commands (run from any project):
 *   npx @pramodyadav027/skills-pm sync [--ref <branch>]
 *     Reads skills.yml from the source repo on GitHub and installs each
 *     skill from its declared upstream repo.
 *
 *   npx @pramodyadav027/skills-pm list
 *   npx @pramodyadav027/skills-pm remove
 *
 * Maintainer commands (run inside this repo):
 *   npx @pramodyadav027/skills-pm fetch
 *     Reads skills.yml locally and downloads each SKILL.md into skills/
 *     for local review or compliance checks. skills/ is git-ignored.
 */

const { skillsConfig, name: PKG_NAME } = require("../package.json");
const SOURCE_REPO = skillsConfig?.repo;
const AGENT = skillsConfig?.agent ?? "claude-code";

if (!SOURCE_REPO) {
  console.error(`Error: set skillsConfig.repo in ${PKG_NAME}'s package.json`);
  process.exit(1);
}

const { spawnSync } = require("node:child_process");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse: parseYaml } = require("yaml");

// Fetch a URL, following redirects.
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": PKG_NAME } }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 303 && res.headers.location) {
          return fetchUrl(res.headers.location).then(resolve, reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          }
        });
      })
      .on("error", reject);
  });
}

// Load and parse skills.yml. Pass { remote: true } to fetch from GitHub,
// or omit to read from the local file (maintainer use).
async function loadManifest({ remote = false, ref = "main" } = {}) {
  let content;
  if (remote) {
    const url = `https://raw.githubusercontent.com/${SOURCE_REPO}/${ref}/skills.yml`;
    console.log(`Fetching manifest from github.com/${SOURCE_REPO} (${ref})...`);
    content = await fetchUrl(url);
  } else {
    content = fs.readFileSync(path.join(__dirname, "..", "skills.yml"), "utf8");
  }
  const manifest = parseYaml(content);
  return (manifest.skills || []).filter((s) => s.enabled !== false);
}

function run(args, { allowFailure = false } = {}) {
  console.log(`\n$ npx ${args.join(" ")}\n`);
  const r = spawnSync("npx", ["--package", "skills", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0 && !allowFailure) process.exit(r.status ?? 1);
  return r.status ?? 0;
}

function git(args, cwd) {
  return spawnSync(
    "git",
    ["-c", "user.name=skills-pm", "-c", "user.email=noreply@skills-pm", ...args],
    { cwd, stdio: "pipe" }
  );
}

// Download selected skills into a temp git repo and install from it.
// This is necessary because the skills CLI's -y flag installs all skills
// from a repo unconditionally — there is no upstream flag to filter by name.
async function installSelected(entry) {
  const { repo, ref = "main", select } = entry;
  const base = entry.path && entry.path !== "." ? `${entry.path}/` : "";

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-pm-"));
  try {
    for (const skillName of select) {
      const url = `https://raw.githubusercontent.com/${repo}/${ref}/${base}${skillName}/SKILL.md`;
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

// Consumer: read manifest from GitHub, install each skill from its upstream repo.
async function cmdSync(ref) {
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
  console.log(`\n✓ Skills are installed and up to date.`);
}

// Maintainer: download SKILL.md files into skills/ for local review.
async function cmdFetch() {
  const entries = await loadManifest({ remote: false });

  if (!entries.length) {
    console.log("No enabled skills found in manifest.");
    return;
  }

  const outDir = path.join(__dirname, "..", "skills");
  const basePath = (p) => (p && p !== "." ? `${p}/` : "");

  for (const entry of entries) {
    const ref = entry.ref ?? "main";

    if (entry.select && entry.select.length > 0) {
      // Multi-skill repo: download <path>/<skill>/SKILL.md for each selected skill.
      for (const skillName of entry.select) {
        const filePath = `${basePath(entry.path)}${skillName}/SKILL.md`;
        const url = `https://raw.githubusercontent.com/${entry.repo}/${ref}/${filePath}`;

        process.stdout.write(`  ${skillName}  (${entry.repo}@${ref})  ... `);
        const content = await fetchUrl(url);

        const dest = path.join(outDir, skillName);
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, "SKILL.md"), content);
        console.log("✓");
      }
    } else {
      // Single-skill repo: download <path>/SKILL.md.
      const filePath = `${basePath(entry.path)}SKILL.md`;
      const url = `https://raw.githubusercontent.com/${entry.repo}/${ref}/${filePath}`;
      const label = entry.repo.split("/")[1];

      process.stdout.write(`  ${label}  (${entry.repo}@${ref})  ... `);
      const content = await fetchUrl(url);

      const dest = path.join(outDir, label);
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, "SKILL.md"), content);
      console.log("✓");
    }
  }

  console.log(`\n✓ Skill files written to skills/.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || "sync";
  const refIdx = argv.indexOf("--ref");
  const ref = refIdx !== -1 ? argv[refIdx + 1] : "main";

  switch (cmd) {
    case "sync":
      await cmdSync(ref);
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
          `  npx ${PKG_NAME} sync [--ref <branch>]   install skills from upstream repos\n` +
          `  npx ${PKG_NAME} fetch                    pull SKILL.md files locally for review\n` +
          `  npx ${PKG_NAME} list                     list installed skills\n` +
          `  npx ${PKG_NAME} remove                   remove ${PKG_NAME} skills`
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
