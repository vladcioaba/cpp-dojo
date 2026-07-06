import { Container } from "@cloudflare/containers";

export class Compiler extends Container {
  defaultPort = 8080;
  sleepAfter = "15m";
  enableInternet = false; // it compiles and runs untrusted code — keep it offline
}

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

    return env.ASSETS.fetch(request);
  },
};
