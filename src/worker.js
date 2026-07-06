import { Container } from "@cloudflare/containers";

export class Compiler extends Container {
  defaultPort = 8080;
  sleepAfter = "15m";
  enableInternet = false; // it compiles and runs untrusted code — keep it offline
}

/* Leaderboard: single DO instance, SQLite storage. Identity is an anonymous
   client-generated token; the handle is display-only, duplicates allowed. */
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
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/score" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return err(400, "bad json"); }
      const token = String(body.token || "");
      const name = String(body.name || "").trim().slice(0, 20).replace(/[<>"'&]/g, "");
      const xp = Math.floor(Number(body.xp));
      const streak = Math.floor(Number(body.streak));
      if (!/^[0-9a-f-]{36}$/.test(token)) return err(400, "bad token");
      if (!name) return err(400, "name required");
      if (!Number.isFinite(xp) || xp < 0 || xp > 10_000_000) return err(400, "bad xp");
      if (!Number.isFinite(streak) || streak < 0 || streak > 100_000) return err(400, "bad streak");

      const cur = this.sql.exec("SELECT xp FROM players WHERE token = ?", token).toArray()[0];
      // XP only ever grows — protects against an accidental localStorage wipe
      const bestXp = cur ? Math.max(cur.xp, xp) : xp;
      this.sql.exec(
        `INSERT INTO players (token, name, xp, streak, updated) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET name = ?, xp = ?, streak = ?, updated = ?`,
        token, name, bestXp, streak, Date.now(),
        name, bestXp, streak, Date.now());
      return json({ ok: true, xp: bestXp });
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const top = this.sql.exec(
        "SELECT name, xp, streak FROM players ORDER BY xp DESC, updated ASC LIMIT 50"
      ).toArray();
      let you = null;
      const token = url.searchParams.get("token") || "";
      if (/^[0-9a-f-]{36}$/.test(token)) {
        const me = this.sql.exec("SELECT name, xp, streak FROM players WHERE token = ?", token).toArray()[0];
        if (me) {
          const rank = this.sql.exec("SELECT COUNT(*) AS n FROM players WHERE xp > ?", me.xp).toArray()[0].n + 1;
          you = { rank, ...me };
        }
      }
      return json({ top, you, players: this.sql.exec("SELECT COUNT(*) AS n FROM players").toArray()[0].n });
    }

    return err(404, "not found");
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function err(status, message) { return json({ error: message }, status); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/run" && request.method === "POST") {
      const body = await request.text();
      if (body.length > 256 * 1024) {
        return Response.json({ error: "body too large" }, { status: 413 });
      }
      const container = env.COMPILER.getByName("main");
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

    if (url.pathname === "/api/score" || url.pathname === "/api/leaderboard") {
      const id = env.LEADERBOARD.idFromName("global");
      return env.LEADERBOARD.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
