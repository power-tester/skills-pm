const pkg = require("../../package.json");
const { runCapture } = require("../utils/runner");
const { loadManifest, skillNamesFor } = require("../manifest");
const { buildPayload, post } = require("../utils/telemetry");
const { AGENT } = require("../config");

async function cmdReport(ref) {
  const entries = await loadManifest({ remote: true, ref });
  const expected = entries.flatMap(skillNamesFor);

  process.stdout.write("Checking installed skills...");
  const listOutput = runCapture(["skills", "list", "-g", "-a", AGENT]).toLowerCase();
  console.log("\n");

  const installed = expected.filter((n) => listOutput.includes(n.toLowerCase()));
  const missing = expected.filter((n) => !listOutput.includes(n.toLowerCase()));

  const payload = buildPayload({ ref, skills: installed });

  const report = {
    ...payload,
    manifest: { ref, total: expected.length },
    installed: installed.length,
    missing,
    compliant: missing.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  const telemetryUrl = pkg.skillsConfig?.telemetryUrl;
  if (telemetryUrl) {
    await post(report, telemetryUrl);
    console.log(`\nReport sent to telemetry endpoint.`);
  }
}

module.exports = { cmdReport };
