/* cpp-dojo — leaderboard page. Identity: {name, token} in localStorage;
   token is a client-generated UUID, the server never hands it out. */

const PROFILE_KEY = "cppdojo-profile";

function profile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); }
  catch { return null; }
}

function gameState() {
  try { return JSON.parse(localStorage.getItem("cppdojo") || "{}"); }
  catch { return {}; }
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function submitScore(p) {
  const st = gameState();
  await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: p.token, name: p.name, xp: st.xp || 0, streak: st.streak || 0 }),
  }).catch(() => {});
}

async function render() {
  const p = profile();
  const claim = document.getElementById("lbClaim");
  const nameInput = document.getElementById("lbName");
  if (p) {
    nameInput.value = p.name;
    document.getElementById("lbJoin").textContent = "rename ▸";
  }

  let data;
  try {
    const r = await fetch("/api/leaderboard" + (p ? `?token=${p.token}` : ""));
    data = await r.json();
  } catch {
    document.getElementById("lbEmpty").hidden = false;
    document.getElementById("lbEmpty").textContent = "leaderboard unreachable — offline?";
    return;
  }

  document.getElementById("lbCount").textContent = `${data.players} player${data.players === 1 ? "" : "s"}`;
  const table = document.getElementById("lbTable");
  const body = document.getElementById("lbBody");
  const empty = document.getElementById("lbEmpty");

  if (!data.top.length) {
    table.hidden = true;
    empty.hidden = false;
    return;
  }
  table.hidden = false;
  empty.hidden = true;
  const medals = ["gold", "silver", "bronze"];
  body.innerHTML = data.top.map((row, i) => {
    const mine = data.you && row.name === data.you.name && row.xp === data.you.xp && i + 1 === data.you.rank;
    return `<tr class="${mine ? "me" : ""} ${medals[i] || ""}">
      <td>${i + 1}</td>
      <td>${esc(row.name)}${mine ? ' <span class="you-tag">you</span>' : ""}</td>
      <td class="num">${row.xp}</td>
      <td class="num">${row.streak > 0 ? "🔥" + row.streak : "—"}</td>
    </tr>`;
  }).join("");

  const youEl = document.getElementById("lbYou");
  if (data.you && data.you.rank > data.top.length) {
    youEl.hidden = false;
    youEl.innerHTML = `you're <strong>#${data.you.rank}</strong> with ${data.you.xp} xp — keep scrolling that feed`;
  } else if (!p) {
    youEl.hidden = false;
    youEl.textContent = "join to get ranked";
  } else {
    youEl.hidden = true;
  }
  document.getElementById("lbUpdated").textContent = "updated " + new Date().toLocaleTimeString();
}

document.getElementById("lbJoin").onclick = async () => {
  const name = document.getElementById("lbName").value.trim().slice(0, 20);
  if (!name) return;
  const p = profile() || { token: crypto.randomUUID() };
  p.name = name;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  await submitScore(p);
  render();
};

document.getElementById("lbName").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("lbJoin").click();
});

(async () => {
  const p = profile();
  if (p) await submitScore(p);   // push latest local xp before first paint
  render();
})();
