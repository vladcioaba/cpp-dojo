/* cpp-dojo — today: an auto-generated daily plan. Pulls due reviews + your
   weakest/stalest skills + a fresh problem, as a checklist that deep-links
   into the feed. Deterministic per day so it's stable until you finish it. */

const { esc } = window.CPP;
const root = document.getElementById("todayRoot");

const SRC = base => [
  "/content/" + base,
  "https://raw.githubusercontent.com/vladcioaba/cpp-dojo-datasets/main/" + base,
  "../datasets/" + base,
];
async function fetchFirst(bases) {
  for (const url of bases) { try { const r = await fetch(url); if (r.ok) return r; } catch { } }
  throw new Error("fetch failed");
}
function loadState() { try { return JSON.parse(localStorage.getItem("cppdojo") || "{}"); } catch { return {}; } }

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
function parseBundle(text) {
  const cards = [];
  for (const sec of text.split(/^## /m).slice(1)) {
    const nl = sec.indexOf("\n"); const head = sec.slice(0, nl).trim(); let body = sec.slice(nl + 1);
    const m = head.match(/^(\w+):\s*(.*)$/); if (!m) continue;
    const meta = {}; body = body.replace(/^(tags|source|difficulty|track):\s*(.+)$/gm, (_, k, v) => { meta[k] = v.trim(); return ""; });
    body = body.replace(/^hint:\s*(.+)$/gm, "").replace(/\n?\*\*Editorial:\*\*\s*([\s\S]*)$/m, "");
    const idBody = body.replace(/\n{3,}/g, "\n\n");   // must match app.js id recipe
    cards.push({ id: m[1] + "-" + hash(head + idBody), type: m[1], title: m[2].trim(),
      tags: (meta.tags || "").split(",").map(t => t.trim()).filter(Boolean) });
  }
  return cards;
}
function dayStr(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ago(ts) {
  if (!ts) return "never";
  const d = Date.now() - ts, day = 86400000;
  if (d < day) return "today";
  const n = Math.round(d / day); return n === 1 ? "yesterday" : n < 30 ? n + "d ago" : Math.round(n / 30) + "mo ago";
}
function isToday(ts) { return ts && dayStr(new Date(ts)) === dayStr(); }

const state = loadState();
const done = state.done || {};
const srs = state.srs || {};
let byTag = new Map(), byTitle = new Map(), trees = [];

function nodeStats(node) {
  const pool = new Map();
  for (const t of node.cardTags || []) for (const c of byTag.get(t) || []) pool.set(c.id, c);
  for (const p of node.problems || []) if (p.playable && byTitle.has(p.name)) { const c = byTitle.get(p.name); pool.set(c.id, c); }
  const ids = [...pool.keys()];
  const solved = ids.filter(id => done[id] === "ok").length;
  const attempted = ids.filter(id => id in done).length;
  const last = ids.reduce((mx, id) => Math.max(mx, srs[id]?.last || 0), 0);
  return { ids, total: ids.length, solved, attempted, last, pct: ids.length ? solved / ids.length : 0 };
}
function status(node, sById) {
  const s = sById.get(node.id);
  if (s.total > 0 && s.pct >= 0.75) return "mastered";
  if (s.solved > 0 || s.attempted > 0) return "learning";
  const met = (node.prereqs || []).every(pid => { const ps = sById.get(pid); return ps && ps.total > 0 && ps.pct >= 0.5; });
  return met || !node.prereqs?.length ? "available" : "locked";
}

function buildPlan() {
  const rnd = mulberry32(parseInt(hash(dayStr()), 36));
  const items = [];

  // 1. reviews due (SRS) — up to 4
  const now = Date.now();
  const dueCardIds = Object.keys(srs).filter(id => srs[id].due <= now);
  const byId = new Map();
  for (const [, list] of byTag) for (const c of list) byId.set(c.id, c);
  const dueCards = dueCardIds.map(id => byId.get(id)).filter(Boolean).slice(0, 4);
  for (const c of dueCards)
    items.push({ kind: "review", title: c.title, meta: "last " + ago(srs[c.id]?.last),
      href: `index.html?card=${encodeURIComponent(c.title)}`, doneToday: isToday(srs[c.id]?.last) });

  // 2. weak/stale skills to build — rank available+learning by (stale + low pct)
  const weak = [];
  for (const tree of trees) {
    const sById = new Map(tree.nodes.map(n => [n.id, nodeStats(n)]));
    for (const n of tree.nodes) {
      const st = status(n, sById);
      if (st === "available" || st === "learning") {
        const s = sById.get(n.id);
        const score = (st === "available" ? 50 : 0) + (now - (s.last || 0)) / 86400000 + (1 - s.pct) * 25 + rnd() * 10;
        weak.push({ tree, node: n, s, st, score });
      }
    }
  }
  weak.sort((a, b) => b.score - a.score);
  for (const w of weak.slice(0, 3))
    items.push({ kind: "skill", title: w.node.name, tree: w.tree.icon + " " + w.tree.name,
      meta: w.st === "available" ? "new skill" : `${w.s.solved}/${w.s.total} · ${ago(w.s.last)}`,
      href: `index.html?tags=${encodeURIComponent((w.node.cardTags || []).join(","))}`,
      doneToday: w.node.cardTags?.some(t => (byTag.get(t) || []).some(c => isToday(srs[c.id]?.last))) });

  // 3. one fresh unsolved playable problem from an available skill
  const fresh = [];
  for (const tree of trees) {
    const sById = new Map(tree.nodes.map(n => [n.id, nodeStats(n)]));
    for (const n of tree.nodes) {
      if (status(n, sById) === "locked") continue;
      for (const p of n.problems || []) {
        const c = p.playable && byTitle.get(p.name);
        if (c && done[c.id] !== "ok") fresh.push({ name: p.name, diff: p.difficulty, id: c.id });
      }
    }
  }
  const seen = new Set();
  const freshUniq = fresh.filter(f => !seen.has(f.name) && seen.add(f.name));
  for (let k = 0; k < Math.min(2, freshUniq.length); k++) {
    const f = freshUniq[Math.floor(rnd() * freshUniq.length)];
    if (!f || items.some(i => i.title === f.name)) continue;
    items.push({ kind: "problem", title: f.name, meta: (f.diff || "") + " · never solved",
      href: `index.html?card=${encodeURIComponent(f.name)}`, doneToday: done[f.id] === "ok" });
  }

  return items;
}

const ICON = { review: "↻", skill: "◆", problem: "▹" };
const LABEL = { review: "review", skill: "build skill", problem: "new problem" };

function render() {
  const items = buildPlan();
  const total = items.length;
  const doneN = items.filter(i => i.doneToday).length;
  const pct = total ? Math.round(doneN / total * 100) : 0;
  const streak = state.streak || 0;

  root.innerHTML = `
    <section class="td-card">
      <div class="td-head">
        <div>
          <h1 class="td-title">today</h1>
          <p class="td-date">${dayStr()} · 🔥 ${streak} day streak</p>
        </div>
        <div class="td-ring" style="--pct:${pct}"><span>${doneN}/${total || 0}</span></div>
      </div>
      ${total ? `<div class="td-list">${items.map(it => `
        <a class="td-item ${it.doneToday ? "done" : ""}" href="${it.href}">
          <span class="td-check">${it.doneToday ? "✓" : ICON[it.kind]}</span>
          <span class="td-body">
            <span class="td-item-title">${esc(it.title)}</span>
            <span class="td-item-meta">${it.tree ? esc(it.tree) + " · " : ""}${esc(it.meta)}</span>
          </span>
          <span class="td-tag td-${it.kind}">${LABEL[it.kind]}</span>
        </a>`).join("")}</div>
        ${doneN === total ? `<div class="td-clear">✓ plan complete — nice. come back tomorrow.</div>` : ""}`
      : `<div class="td-empty">practice a few cards in the feed to seed your skill map — then your daily plan appears here.</div>`}
      <a class="btn td-open-feed" href="index.html">open the feed ▸</a>
    </section>`;
}

(async () => {
  try {
    const [sk, bd] = await Promise.all([fetchFirst(SRC("skills.json")), fetchFirst(SRC("bundle.md"))]);
    trees = (await sk.json()).trees || [];
    for (const c of parseBundle(await bd.text())) {
      byTitle.set(c.title, c);
      for (const t of c.tags) { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(c); }
    }
    render();
  } catch (e) {
    root.innerHTML = `<div class="error-card">couldn't build today's plan: ${esc(String(e))}</div>`;
  }
})();
