import { Container } from "@cloudflare/containers";

const COMPILER_POOL = 1; // number of container buckets; keep <= max_instances (cost cap)

export class Compiler extends Container {
  defaultPort = 8080;
  sleepAfter = "5m"; // stop sooner when idle → fewer billed compute-seconds
  enableInternet = false; // it compiles and runs untrusted code — keep it offline
}

/* Leaderboard + accounts: single DO instance, SQLite storage.
   Two identity paths, both land in `players`:
   - anonymous: a client-generated UUID `token` (legacy, still works)
   - account:   nickname + email + password → a session token
   Passwords are PBKDF2-SHA256 with a per-user salt; plaintext is never stored. */
const PBKDF2_ITERS = 100_000; // Workers runtime hard-caps PBKDF2 at 100k
const SESSION_TTL = 90 * 24 * 3600 * 1000; // 90 days

export class Leaderboard {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
        token   TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        xp      INTEGER NOT NULL DEFAULT 0,
        streak  INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL
      )`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (
        email   TEXT PRIMARY KEY,
        nick    TEXT NOT NULL,
        salt    TEXT NOT NULL,
        hash    TEXT NOT NULL,
        created INTEGER NOT NULL
      )`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
        token   TEXT PRIMARY KEY,
        email   TEXT NOT NULL,
        created INTEGER NOT NULL
      )`);
    });
  }

  /* account token = "acct:" + email; keeps one players row per account and
     never collides with the 36-char anonymous UUID namespace. */
  playerKey(email) { return "acct:" + email; }

  session(token) {
    if (!/^[0-9a-f]{64}$/.test(token || "")) return null;
    const s = this.sql.exec("SELECT email, created FROM sessions WHERE token = ?", token).toArray()[0];
    if (!s) return null;
    if (Date.now() - s.created > SESSION_TTL) {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
      return null;
    }
    return s.email;
  }

  profile(email) {
    const a = this.sql.exec("SELECT nick FROM accounts WHERE email = ?", email).toArray()[0];
    const p = this.sql.exec("SELECT xp, streak FROM players WHERE token = ?", this.playerKey(email)).toArray()[0];
    return { nick: a?.nick || "", email, xp: p?.xp || 0, streak: p?.streak || 0 };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    const post = request.method === "POST";

    /* ── register ─────────────────────────────────────────────── */
    if (p === "/api/register" && post) {
      let b; try { b = await request.json(); } catch { return err(400, "bad json"); }
      const nick = String(b.nick || "").trim().slice(0, 20).replace(/[<>"'&]/g, "");
      const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
      const password = String(b.password || "");
      if (nick.length < 2) return err(400, "nickname too short");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(400, "invalid email");
      if (password.length < 8) return err(400, "password must be at least 8 characters");
      if (this.sql.exec("SELECT 1 FROM accounts WHERE email = ?", email).toArray()[0])
        return err(409, "an account with that email already exists");

      const salt = randomHex(16);
      const hash = await pbkdf2(password, salt);
      const now = Date.now();
      // the exists-check and this insert straddle an await, so two concurrent
      // registrations can both pass the check — let the PRIMARY KEY be the
      // source of truth and turn the conflict into a clean 409, not a 500.
      try {
        this.sql.exec("INSERT INTO accounts (email, nick, salt, hash, created) VALUES (?, ?, ?, ?, ?)",
          email, nick, salt, hash, now);
      } catch {
        return err(409, "an account with that email already exists");
      }
      // seed / adopt the players row for this account
      this.sql.exec(
        `INSERT INTO players (token, name, xp, streak, updated) VALUES (?, ?, 0, 0, ?)
         ON CONFLICT(token) DO UPDATE SET name = ?`,
        this.playerKey(email), nick, now, nick);
      const token = await this.newSession(email);
      return json({ ok: true, token, profile: this.profile(email) });
    }

    /* ── login ────────────────────────────────────────────────── */
    if (p === "/api/login" && post) {
      let b; try { b = await request.json(); } catch { return err(400, "bad json"); }
      const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
      const password = String(b.password || "");
      const a = this.sql.exec("SELECT salt, hash FROM accounts WHERE email = ?", email).toArray()[0];
      // Always compute a hash (even when the account is missing) so response
      // time doesn't reveal whether the email exists; generic error either way.
      const salt = a ? a.salt : "00000000000000000000000000000000";
      const cand = await pbkdf2(password, salt);
      if (!a || !timingSafeEqual(cand, a.hash)) return err(401, "invalid email or password");
      const token = await this.newSession(email);
      return json({ ok: true, token, profile: this.profile(email) });
    }

    /* ── logout ───────────────────────────────────────────────── */
    if (p === "/api/logout" && post) {
      let b; try { b = await request.json(); } catch { return err(400, "bad json"); }
      if (/^[0-9a-f]{64}$/.test(b.token || ""))
        this.sql.exec("DELETE FROM sessions WHERE token = ?", b.token);
      return json({ ok: true });
    }

    /* ── me (validate session) ────────────────────────────────── */
    if (p === "/api/me" && request.method === "GET") {
      const email = this.session(bearer(request) || url.searchParams.get("token"));
      if (!email) return err(401, "not logged in");
      return json({ profile: this.profile(email) });
    }

    /* ── score: session token OR anonymous UUID ───────────────── */
    if (p === "/api/score" && post) {
      let b; try { b = await request.json(); } catch { return err(400, "bad json"); }
      const xp = Math.floor(Number(b.xp));
      const streak = Math.floor(Number(b.streak));
      if (!Number.isFinite(xp) || xp < 0 || xp > 10_000_000) return err(400, "bad xp");
      if (!Number.isFinite(streak) || streak < 0 || streak > 100_000) return err(400, "bad streak");

      let key, name;
      const email = this.session(b.session);
      if (email) {
        key = this.playerKey(email);
        name = this.sql.exec("SELECT nick FROM accounts WHERE email = ?", email).toArray()[0]?.nick || "player";
      } else {
        key = String(b.token || "");
        name = String(b.name || "").trim().slice(0, 20).replace(/[<>"'&]/g, "");
        if (!/^[0-9a-f-]{36}$/.test(key)) return err(400, "bad token");
        if (!name) return err(400, "name required");
      }

      const cur = this.sql.exec("SELECT xp, streak FROM players WHERE token = ?", key).toArray()[0];
      // an unknown anonymous token claiming a big total is a spoof, not a
      // player — real anon progress syncs early and often. Accounts exempt.
      if (!cur && !email && xp > 5000) return err(400, "sign in to sync that much xp");
      const bestXp = cur ? Math.max(cur.xp, xp) : xp;         // XP only ever grows
      const bestStreak = cur ? Math.max(cur.streak, streak) : streak; // don't clobber a higher streak from a fresh device
      this.sql.exec(
        `INSERT INTO players (token, name, xp, streak, updated) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET name = ?, xp = ?, streak = ?, updated = ?`,
        key, name, bestXp, bestStreak, Date.now(),
        name, bestXp, bestStreak, Date.now());
      return json({ ok: true, xp: bestXp });
    }

    /* ── leaderboard ──────────────────────────────────────────── */
    if (p === "/api/leaderboard" && request.method === "GET") {
      const top = this.sql.exec(
        "SELECT name, xp, streak FROM players ORDER BY xp DESC, updated ASC LIMIT 50"
      ).toArray();
      let you = null;
      // session prefers the Authorization header — tokens in query strings
      // end up in edge logs; query params kept for older bundled clients
      const email = this.session(bearer(request) || url.searchParams.get("session"));
      const key = email ? this.playerKey(email) : (url.searchParams.get("token") || "");
      if (email || /^[0-9a-f-]{36}$/.test(key)) {
        const me = this.sql.exec("SELECT name, xp, streak FROM players WHERE token = ?", key).toArray()[0];
        if (me) {
          const rank = this.sql.exec("SELECT COUNT(*) AS n FROM players WHERE xp > ?", me.xp).toArray()[0].n + 1;
          you = { rank, ...me };
        }
      }
      return json({ top, you, players: this.sql.exec("SELECT COUNT(*) AS n FROM players").toArray()[0].n });
    }

    return err(404, "not found");
  }

  async newSession(email) {
    const token = randomHex(32);
    this.sql.exec("INSERT INTO sessions (token, email, created) VALUES (?, ?, ?)", token, email, Date.now());
    // housekeeping: expiry is otherwise lazy, so cull dead rows and cap live
    // sessions per account (keep the 5 newest) so the table can't grow forever
    this.sql.exec("DELETE FROM sessions WHERE created < ?", Date.now() - SESSION_TTL);
    this.sql.exec(
      `DELETE FROM sessions WHERE email = ? AND token NOT IN
         (SELECT token FROM sessions WHERE email = ? ORDER BY created DESC LIMIT 5)`,
      email, email);
    return token;
  }
}

/* ── crypto helpers (Web Crypto, available in the Workers runtime) ── */
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
async function pbkdf2(password, saltHex) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function err(status, message) { return json({ error: message }, status); }

/* session token from "Authorization: Bearer <hex>" */
function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer ([0-9a-f]{64})$/);
  return m ? m[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Content proxy: the backend loads learning content straight from the
    // datasets repo's GitHub raw and serves it same-origin (edge-cached), so
    // the browser never talks to GitHub or trips CORS / rate limits.
    // /content/<path> → datasets repo <path> (bundle.md, skills.json, …).
    if (url.pathname.startsWith("/content/") && request.method === "GET") {
      const rel = url.pathname.slice("/content/".length);
      // only allow safe relative paths into the datasets repo
      if (!/^[\w.\-\/]+$/.test(rel) || rel.includes("..")) {
        return new Response("bad path", { status: 400 });
      }
      const upstream = "https://raw.githubusercontent.com/vladcioaba/cpp-dojo-datasets/main/" + rel;
      const res = await fetch(upstream, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (!res.ok) return new Response("content unavailable", { status: 502 });
      const type = rel.endsWith(".json") ? "application/json"
        : rel.endsWith(".md") ? "text/markdown; charset=utf-8"
        : "text/plain; charset=utf-8";
      return new Response(res.body, {
        status: 200,
        headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" },
      });
    }

    if (url.pathname === "/api/run" && request.method === "POST") {
      // Per-IP rate limit — the compile service runs untrusted code, so cap
      // how fast any one client can hammer it (DoS + billed-compute abuse).
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.RUN_LIMIT.limit({ key: ip });
      if (!success) {
        return Response.json(
          { error: "rate limited — slow down (max ~10 compiles / 10s)" },
          { status: 429, headers: { "Retry-After": "10" } });
      }

      const body = await request.text();
      if (body.length > 256 * 1024) {
        return Response.json({ error: "body too large" }, { status: 413 });
      }
      // Spread load across a small pool instead of one shared instance, so a
      // single abuser degrades at most one bucket, not everyone.
      const bucket = "run-" + Math.floor(Math.random() * COMPILER_POOL);
      const container = env.COMPILER.getByName(bucket);
      const res = await container.fetch("http://compiler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const AUTH = ["/api/register", "/api/login", "/api/logout", "/api/me", "/api/score", "/api/leaderboard"];
    if (AUTH.includes(url.pathname)) {
      // Throttle credential endpoints per IP to slow brute-force / spam.
      // Defensive: if the limiter binding is unavailable, don't 500 — PBKDF2
      // cost still makes online guessing slow, and the generic errors don't
      // leak which emails exist.
      if (url.pathname === "/api/login" || url.pathname === "/api/register") {
        const ip = request.headers.get("CF-Connecting-IP") || "anon";
        const limiter = env.AUTH_LIMIT || env.RUN_LIMIT;
        try {
          const { success } = await limiter.limit({ key: "auth:" + ip });
          if (!success) {
            return Response.json({ error: "too many attempts — wait a moment" },
              { status: 429, headers: { "Retry-After": "10" } });
          }
        } catch { /* limiter unavailable — proceed */ }
      }
      // score/leaderboard were unthrottled: a loop could spam rows into the
      // DO or hammer reads. Same per-IP budget as compiles.
      if (url.pathname === "/api/score" || url.pathname === "/api/leaderboard") {
        const ip = request.headers.get("CF-Connecting-IP") || "anon";
        try {
          const { success } = await env.RUN_LIMIT.limit({ key: "board:" + ip });
          if (!success) {
            return Response.json({ error: "slow down" },
              { status: 429, headers: { "Retry-After": "10" } });
          }
        } catch { /* limiter unavailable — proceed */ }
      }
      const id = env.LEADERBOARD.idFromName("global");
      return env.LEADERBOARD.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
