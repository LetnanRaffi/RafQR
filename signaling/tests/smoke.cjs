// Run while `npx wrangler dev --config signaling/wrangler.jsonc` is listening.
const assert = require("node:assert/strict");
const WebSocket = require("ws");

const base = process.env.SIGNALING_TEST_URL || "http://127.0.0.1:8787";
const origin = process.env.SIGNALING_TEST_ORIGIN || "http://localhost:3000";

function inbox(socket) {
  const queue = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const value = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(value);
    else queue.push(value);
  });
  return async function next() {
    if (queue.length) return queue.shift();
    return Promise.race([
      new Promise((resolve) => waiters.push(resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("WebSocket message timeout")), 3000)),
    ]);
  };
}

function connect(code) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base.replace(/^http/, "ws")}/sessions/${code}/ws`, { origin });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function main() {
  const denied = await fetch(`${base}/sessions`, { method: "POST", headers: { Origin: "https://evil.example" } });
  assert.equal(denied.status, 403);

  const created = await fetch(`${base}/sessions`, { method: "POST", headers: { Origin: origin } });
  assert.equal(created.status, 201);
  const { code, senderToken, expiresAt } = await created.json();
  assert.match(code, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(typeof senderToken, "string");
  assert.ok(expiresAt > Date.now());

  const invalidCode = await fetch(`${base}/sessions/no/ws`, { headers: { Origin: origin } });
  assert.equal(invalidCode.status, 400);

  const impostor = await connect(code);
  const impostorNext = inbox(impostor);
  impostor.send(JSON.stringify({ type: "join", role: "sender", token: "wrong-token" }));
  assert.equal((await impostorNext()).code, "unauthorized");

  const sender = await connect(code);
  const senderNext = inbox(sender);
  sender.send(JSON.stringify({ type: "join", role: "sender", token: senderToken }));
  assert.deepEqual((await senderNext()).type, "joined");

  const receiver = await connect(code);
  const receiverNext = inbox(receiver);
  receiver.send(JSON.stringify({ type: "join", role: "receiver" }));
  assert.equal((await receiverNext()).type, "joined");
  assert.deepEqual(await senderNext(), { type: "join", role: "receiver" });
  assert.deepEqual(await senderNext(), { type: "peer-joined", role: "receiver" });
  assert.deepEqual(await receiverNext(), { type: "peer-joined", role: "sender" });

  const second = await connect(code);
  const secondNext = inbox(second);
  second.send(JSON.stringify({ type: "join", role: "receiver" }));
  assert.equal((await secondNext()).code, "session_full");

  const offer = { type: "offer", sdp: { type: "offer", sdp: "v=0" } };
  sender.send(JSON.stringify(offer));
  assert.deepEqual(await receiverNext(), offer);
  const answer = { type: "answer", sdp: { type: "answer", sdp: "v=0" } };
  receiver.send(JSON.stringify(answer));
  assert.deepEqual(await senderNext(), answer);
  const ice = { type: "ice", candidate: { candidate: "candidate:1", sdpMid: "0" } };
  sender.send(JSON.stringify(ice));
  assert.deepEqual(await receiverNext(), ice);

  receiver.close();
  assert.deepEqual(await senderNext(), { type: "peer-left", role: "receiver" });
  sender.close();
  second.close();
  console.log("signaling smoke: passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
