// Run against a local wrangler dev server; local rate limiting is deterministic.
const assert = require("node:assert/strict");

const base = process.env.SIGNALING_TEST_URL || "http://127.0.0.1:8787";
const origin = process.env.SIGNALING_TEST_ORIGIN || "http://localhost:3000";
const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

async function main() {
  let rejected = false;
  for (let index = 0; index < 45; index++) {
    const response = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { Origin: origin, "CF-Connecting-IP": testIp },
    });
    if (response.status === 429) {
      assert.equal(response.headers.get("Retry-After"), "60");
      rejected = true;
      break;
    }
    assert.equal(response.status, 201);
  }
  assert.equal(rejected, true, "session creation should be rate limited");
  console.log("signaling rate limit: passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
