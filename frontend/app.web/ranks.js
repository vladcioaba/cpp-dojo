/* cpp-dojo — leaderboard + accounts.
   Logged-in identity: {session, profile} in localStorage `cppdojo-auth`.
   The password is sent once over HTTPS to /api/register|login and never stored
   client-side — only the returned session token is kept. */

const AUTH_KEY = "cppdojo-auth";
const LEGACY_KEY = "cppdojo-profile"; // old anonymous {name, token}

function auth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}
function setAuth(a) {
  if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
  else localStorage.removeItem(AUTH_KEY);
}
function legacy() {
  try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); }
  catch { return null; }
}
function gameState() {
  try { return JSON.parse(localStorage.getItem("cppdojo") || "{}"); }
  catch { return {}; }
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Push local XP to the server under whichever identity we have. */
async function submitScore() {
  const st = gameState();
  const a = auth();
  const leg = legacy();
  let body;
  if (a) body = { session: a.session, xp: st.xp || 0, streak: st.streak || 0 };
  else if (leg) body = { token: leg.token, name: leg.name, xp: st.xp || 0, streak: st.streak || 0 };
  else return;
  await fetch("/api/score", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/* ── auth form ───────────────────────────────────────────────── */
let mode = "login";
const el = id => document.getElementById(id);

function setMode(m) {
  mode = m;
  document.querySelectorAll(".lb-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  el("fNick").hidden = m !== "register";
  el("fNick").required = m === "register";
  el("fPass").autocomplete = m === "register" ? "new-password" : "current-password";
  el("fSubmit").textContent = m === "register" ? "create account ▸" : "log in ▸";
  el("fMsg").textContent = "";
}

document.querySelectorAll(".lb-tab").forEach(t => t.onclick = () => setMode(t.dataset.mode));

el("lbForm").addEventListener("submit", async e => {
  e.preventDefault();
  const nick = el("fNick").value.trim();
  const email = el("fEmail").value.trim();
  const password = el("fPass").value;
  const msg = el("fMsg");
  msg.className = "lb-msg";
  msg.textContent = mode === "register" ? "creating…" : "checking…";
  el("fSubmit").disabled = true;

  const endpoint = mode === "register" ? "/api/register" : "/api/login";
  const payload = mode === "register" ? { nick, email, password } : { email, password };
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { el("fSubmit").disabled = false; msg.className = "lb-msg err"; msg.textContent = "network error"; return; }

  el("fSubmit").disabled = false;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    msg.className = "lb-msg err";
    msg.textContent = data.error || "failed";
    return;
  }
  el("fPass").value = "";
  setAuth({ session: data.token, profile: data.profile });
  await submitScore();       // carry any local XP up under the new account
  render();
});

el("btnLogout").onclick = async () => {
  const a = auth();
  if (a) await fetch("/api/logout", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: a.session }),
  }).catch(() => {});
  setAuth(null);
  render();
};

/* ── render ──────────────────────────────────────────────────── */
async function render() {
  const a = auth();
  el("lbAuth").hidden = !!a;
  el("lbMe").hidden = !a;
  if (a) {
    el("meNick").textContent = a.profile.nick;
    el("meStats").textContent = `${a.profile.email} · ${a.profile.xp} xp`;
  }

  const q = a ? `?session=${a.session}` : (legacy() ? `?token=${legacy().token}` : "");
  let data;
  try { data = await (await fetch("/api/leaderboard" + q)).json(); }
  catch {
    el("lbEmpty").hidden = false;
    el("lbEmpty").textContent = "leaderboard unreachable — offline?";
    return;
  }

  el("lbCount").textContent = `${data.players} player${data.players === 1 ? "" : "s"}`;
  const table = el("lbTable"), body = el("lbBody"), empty = el("lbEmpty");
  if (!data.top.length) { table.hidden = true; empty.hidden = false; return; }
  table.hidden = false; empty.hidden = true;

  const medals = ["gold", "silver", "bronze"];
  const myName = a ? a.profile.nick : (legacy() && legacy().name);
  body.innerHTML = data.top.map((row, i) => {
    const mine = data.you && row.xp === data.you.xp && row.name === data.you.name && i + 1 === data.you.rank;
    return `<tr class="${mine ? "me" : ""} ${medals[i] || ""}">
      <td>${i + 1}</td>
      <td>${esc(row.name)}${mine ? ' <span class="you-tag">you</span>' : ""}</td>
      <td class="num">${row.xp}</td>
      <td class="num">${row.streak > 0 ? "🔥" + row.streak : "—"}</td>
    </tr>`;
  }).join("");

  const youEl = el("lbYou");
  if (data.you && data.you.rank > data.top.length) {
    youEl.hidden = false;
    youEl.innerHTML = `you're <strong>#${data.you.rank}</strong> with ${data.you.xp} xp — keep scrolling that feed`;
  } else if (!a && !legacy()) {
    youEl.hidden = false;
    youEl.textContent = "log in or sign up to get ranked across devices";
  } else {
    youEl.hidden = true;
  }
  el("lbUpdated").textContent = "updated " + new Date().toLocaleTimeString();
}

/* ── boot ────────────────────────────────────────────────────── */
setMode("login");
(async () => {
  const a = auth();
  if (a) {
    // validate session; refresh profile or drop it if expired
    try {
      const r = await fetch("/api/me?token=" + a.session);
      if (r.ok) { a.profile = (await r.json()).profile; setAuth(a); }
      else if (r.status === 401) setAuth(null);
    } catch { /* offline — keep cached */ }
  }
  await submitScore();
  render();
})();
