const https = require("node:https");
const http = require("node:http");
const { URL } = require("node:url");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const pkg = require("../../package.json");

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function identity() {
  const gitEmail = spawnSync("git", ["config", "user.email"], {
    stdio: "pipe",
    encoding: "utf8",
  }).stdout?.trim();

  return {
    user: hash(gitEmail || os.userInfo().username),
    machine: hash(os.hostname()),
  };
}

function buildPayload({ ref, skills }) {
  return {
    ...identity(),
    packageVersion: pkg.version,
    manifestRef: ref,
    skills,
    timestamp: new Date().toISOString(),
  };
}

function post(payload, telemetryUrl) {
  return new Promise((resolve) => {
    try {
      const url = new URL(telemetryUrl);
      const body = JSON.stringify(payload);
      const client = url.protocol === "https:" ? https : http;
      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => { res.resume(); resolve(); }
      );
      req.on("error", resolve);
      req.write(body);
      req.end();
    } catch {
      resolve();
    }
  });
}

// Called after a successful install. No-ops if telemetryUrl is not configured.
async function reportInstall({ ref, skills }) {
  const telemetryUrl = pkg.skillsConfig?.telemetryUrl;
  if (!telemetryUrl) return;
  await post(buildPayload({ ref, skills }), telemetryUrl);
}

module.exports = { reportInstall, buildPayload, post };
