import { DurableObject } from "cloudflare:workers";

interface Env {
  SESSIONS: DurableObjectNamespace<SignalingSession>;
  SESSION_CREATION_LIMITER: RateLimit;
  ALLOWED_ORIGINS: string;
  P2P_WAIT_TIMEOUT_MS: string;
}

interface SessionRecord {
  code: string;
  tokenHash: string;
  expiresAt: number;
  receiverJoined: boolean;
}

type Role = "sender" | "receiver";
interface PeerAttachment {
  role?: Role;
  joinedAt: number;
  windowStartedAt: number;
  messagesInWindow: number;
}
interface CandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const MAX_SIGNAL_BYTES = 65536;
const MAX_MESSAGES_PER_10_SECONDS = 100;
const MAX_SOCKETS = 4;

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  return allowed.includes(origin) ? origin : null;
}

function randomUrlToken(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let raw = "";
  for (const byte of data) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function waitTimeout(env: Env): number {
  const value = Number(env.P2P_WAIT_TIMEOUT_MS);
  if (!Number.isInteger(value) || value < 1000 || value > 3_600_000) {
    throw new Error("P2P_WAIT_TIMEOUT_MS must be between 1000 and 3600000");
  }
  return value;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true });
    }

    const origin = allowedOrigin(request, env);
    if (!origin) return json({ error: "origin_not_allowed" }, 403);

    if (url.pathname === "/sessions" && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/sessions" && request.method === "POST") {
      const headers = corsHeaders(origin);
      const ip = request.headers.get("CF-Connecting-IP") || "local-dev";
      const { success } = await env.SESSION_CREATION_LIMITER.limit({ key: `create:${ip}` });
      if (!success) {
        return json({ error: "rate_limited" }, 429, { ...headers, "Retry-After": "60" });
      }
      let timeout: number;
      try {
        timeout = waitTimeout(env);
      } catch {
        return json({ error: "invalid_configuration" }, 500, headers);
      }

      // A 12-byte random code has 96 bits of entropy. Retry only on the
      // astronomically unlikely object-name collision.
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = randomUrlToken(12);
        const senderToken = randomUrlToken(32);
        const expiresAt = Date.now() + timeout;
        const stub = env.SESSIONS.getByName(code);
        const response = await stub.fetch("https://internal/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, tokenHash: await sha256(senderToken), expiresAt }),
        });
        if (response.status === 201) return json({ code, senderToken, expiresAt }, 201, headers);
        if (response.status !== 409) return json({ error: "session_creation_failed" }, 503, headers);
      }
      return json({ error: "session_creation_failed" }, 503, headers);
    }

    const match = /^\/sessions\/([^/]+)\/ws$/.exec(url.pathname);
    if (match && request.method === "GET") {
      const code = match[1];
      if (!CODE_PATTERN.test(code)) return json({ error: "invalid_code" }, 400, corsHeaders(origin));
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return json({ error: "websocket_required" }, 426, corsHeaders(origin));
      }
      return env.SESSIONS.getByName(code).fetch(request);
    }

    return json({ error: "not_found" }, 404, corsHeaders(origin));
  },
};

export class SignalingSession extends DurableObject<Env> {
  private session: SessionRecord | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.session = await ctx.storage.get<SessionRecord>("session");
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/initialize" && request.method === "POST") {
      const data: unknown = await request.json().catch(() => null);
      if (!isRecord(data) || typeof data.code !== "string" || !CODE_PATTERN.test(data.code) ||
          typeof data.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(data.tokenHash) ||
          typeof data.expiresAt !== "number" || data.expiresAt <= Date.now()) {
        return json({ error: "invalid_session" }, 400);
      }
      const session: SessionRecord = {
        code: data.code,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        receiverJoined: false,
      };
      const created = await this.ctx.storage.transaction(async (tx) => {
        if (await tx.get("session")) return false;
        await tx.put("session", session);
        return true;
      });
      if (!created) return json({ error: "already_exists" }, 409);
      this.session = session;
      await this.ctx.storage.setAlarm(session.expiresAt);
      return json({ ok: true }, 201);
    }

    if (!url.pathname.endsWith("/ws") || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "not_found" }, 404);
    }
    if (!this.session || (Date.now() >= this.session.expiresAt && !this.session.receiverJoined)) {
      return json({ error: "expired_or_invalid_code" }, 410);
    }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return json({ error: "session_full" }, 429);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ joinedAt: Date.now(), windowStartedAt: Date.now(), messagesInWindow: 0 } satisfies PeerAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_SIGNAL_BYTES) {
      this.reject(socket, "invalid_message", "Pesan signaling tidak valid");
      return;
    }
    const peer = socket.deserializeAttachment() as PeerAttachment | null;
    if (!peer) {
      this.reject(socket, "invalid_connection", "Koneksi tidak valid");
      return;
    }
    const now = Date.now();
    if (now - peer.windowStartedAt >= 10_000) {
      peer.windowStartedAt = now;
      peer.messagesInWindow = 0;
    }
    peer.messagesInWindow++;
    socket.serializeAttachment(peer);
    if (peer.messagesInWindow > MAX_MESSAGES_PER_10_SECONDS) {
      this.reject(socket, "rate_limited", "Terlalu banyak pesan signaling");
      return;
    }

    let data: unknown;
    try { data = JSON.parse(message); } catch {
      this.reject(socket, "invalid_message", "JSON tidak valid");
      return;
    }
    if (!isRecord(data) || typeof data.type !== "string") {
      this.reject(socket, "invalid_message", "Format pesan tidak valid");
      return;
    }
    if (!peer.role) {
      await this.join(socket, peer, data);
      return;
    }
    if (!this.session) {
      this.reject(socket, "expired_or_invalid_code", "Sesi tidak tersedia");
      return;
    }

    const other = this.peer(peer.role === "sender" ? "receiver" : "sender");
    if (data.type === "offer" && peer.role === "sender" && isSessionDescription(data.sdp, "offer")) {
      other?.send(JSON.stringify({ type: "offer", sdp: data.sdp }));
    } else if (data.type === "answer" && peer.role === "receiver" && isSessionDescription(data.sdp, "answer")) {
      other?.send(JSON.stringify({ type: "answer", sdp: data.sdp }));
    } else if (data.type === "ice" && isIceCandidate(data.candidate)) {
      const source = data.candidate;
      const candidate = source === null ? null : {
        candidate: source.candidate,
        sdpMid: source.sdpMid,
        sdpMLineIndex: source.sdpMLineIndex,
        usernameFragment: source.usernameFragment,
      };
      other?.send(JSON.stringify({ type: "ice", candidate }));
    } else {
      this.reject(socket, "invalid_message", "Pesan signaling tidak dikenal");
    }
  }

  private async join(socket: WebSocket, peer: PeerAttachment, data: Record<string, unknown>): Promise<void> {
    if (data.type !== "join" || (data.role !== "sender" && data.role !== "receiver")) {
      this.reject(socket, "join_required", "Pesan pertama harus join");
      return;
    }
    const session = this.session;
    if (!session || (Date.now() >= session.expiresAt && !session.receiverJoined)) {
      this.reject(socket, "expired_or_invalid_code", "Sesi kedaluwarsa");
      return;
    }
    const role = data.role;
    if (role === "sender") {
      const token = data.token ?? data.senderToken;
      if (typeof token !== "string" || (await sha256(token)) !== session.tokenHash) {
        this.reject(socket, "unauthorized", "Token pengirim tidak valid");
        return;
      }
    }
    if (this.peer(role) || (role === "receiver" && session.receiverJoined)) {
      this.reject(socket, "session_full", "Sesi sudah dipakai");
      return;
    }
    if (role === "receiver") {
      session.receiverJoined = true;
      await this.ctx.storage.put("session", session);
      await this.ctx.storage.deleteAlarm();
    }
    peer.role = role;
    socket.serializeAttachment(peer);
    socket.send(JSON.stringify({ type: "joined", role, expiresAt: session.expiresAt }));
    const other = this.peer(role === "sender" ? "receiver" : "sender");
    if (other) {
      other.send(JSON.stringify({ type: "join", role }));
      other.send(JSON.stringify({ type: "peer-joined", role }));
      socket.send(JSON.stringify({ type: "peer-joined", role: role === "sender" ? "receiver" : "sender" }));
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.peerLeft(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.peerLeft(socket);
    socket.close(1011, "WebSocket error");
  }

  private async peerLeft(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as PeerAttachment | null;
    if (!attachment?.role || !this.session) return;
    const other = this.peer(attachment.role === "sender" ? "receiver" : "sender");
    if (other) {
      other.send(JSON.stringify({ type: "peer-left", role: attachment.role }));
      other.close(1000, "peer-left");
    }
    this.session = undefined;
    await this.ctx.storage.delete("session");
    await this.ctx.storage.deleteAlarm();
  }

  private peer(role: Role): WebSocket | undefined {
    return this.ctx.getWebSockets().find((socket) => {
      const attachment = socket.deserializeAttachment() as PeerAttachment | null;
      return attachment?.role === role && socket.readyState === WebSocket.OPEN;
    });
  }

  private reject(socket: WebSocket, code: string, message: string): void {
    socket.send(JSON.stringify({ type: "error", code, message }));
    socket.close(1008, code);
  }

  async alarm(): Promise<void> {
    if (!this.session || this.session.receiverJoined || Date.now() < this.session.expiresAt) return;
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(JSON.stringify({ type: "error", code: "expired", message: "Sesi kedaluwarsa" }));
      socket.close(1000, "expired");
    }
    await this.ctx.storage.delete("session");
    this.session = undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionDescription(value: unknown, type: "offer" | "answer"): value is { type: string; sdp: string } {
  return isRecord(value) && value.type === type && typeof value.sdp === "string" && value.sdp.length > 0 && value.sdp.length <= MAX_SIGNAL_BYTES;
}

function isIceCandidate(value: unknown): value is CandidateInit | null {
  return value === null || (isRecord(value) && typeof value.candidate === "string" && value.candidate.length <= 4096 &&
    (value.sdpMid === null || value.sdpMid === undefined || typeof value.sdpMid === "string") &&
    (value.sdpMLineIndex === null || value.sdpMLineIndex === undefined ||
      (typeof value.sdpMLineIndex === "number" && Number.isInteger(value.sdpMLineIndex))) &&
    (value.usernameFragment === undefined || value.usernameFragment === null ||
      (typeof value.usernameFragment === "string" && value.usernameFragment.length <= 256)));
}
