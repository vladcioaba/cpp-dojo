/* cpp-dojo — skills view. Your progress from the perspective of skills:
   per-domain talent trees, per-node mastery, a "last practiced" ticker, and
   a "polish next" queue. Reads the skill trees + reconstructs card ids from
   the bundle so local practice history maps onto each pattern. */

const { esc } = window.CPP;
const root = document.getElementById("skillsRoot");

const SRC = base => [
  "/content/" + base,
  "https://raw.githubusercontent.com/vladcioaba/cpp-dojo-datasets/main/" + base,
  "../datasets/" + base,
];

function loadState() {
  try { return JSON.parse(localStorage.getItem("cppdojo") || "{}"); }
  catch { return {}; }
}

async function fetchFirst(bases) {
  for (const url of bases) {
    try { const r = await fetch(url); if (r.ok) return r; } catch { /* next */ }
  }
  throw new Error("fetch failed");
}

/* reconstruct card ids/tags from the bundle (id = type + "-" + hash) */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function parseBundle(text) {
  const cards = [];
  for (const sec of text.split(/^## /m).slice(1)) {
    const nl = sec.indexOf("\n");
    const head = sec.slice(0, nl).trim();
    let body = sec.slice(nl + 1);
    const m = head.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const type = m[1], title = m[2].trim();
    const meta = {};
    body = body.replace(/^(tags|source|difficulty|track):\s*(.+)$/gm, (_, k, v) => { meta[k] = v.trim(); return ""; });
    cards.push({
      id: type + "-" + hash(head + body),
      type, title,
      tags: (meta.tags || "").split(",").map(t => t.trim()).filter(Boolean),
    });
  }
  return cards;
}

/* ── mastery engine ──────────────────────────────────────────── */
const state = loadState();
const done = state.done || {};
const srs = state.srs || {};

function ago(ts) {
  if (!ts) return "never";
  const d = Date.now() - ts;
  const day = 86400000;
  if (d < 3600000) return "just now";
  if (d < day) return Math.round(d / 3600000) + "h ago";
  const days = Math.round(d / day);
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  return Math.round(days / 30) + "mo ago";
}

let byTag = new Map(), byTitle = new Map();

function nodeStats(node) {
  // practice pool: cards whose tags intersect the node's cardTags + playable problems by title
  const pool = new Map();
  for (const t of (node.cardTags || []))
    for (const c of (byTag.get(t) || [])) pool.set(c.id, c);
  for (const p of node.problems || [])
    if (p.playable && byTitle.has(p.title || p.name)) {
      const c = byTitle.get(p.title || p.name); pool.set(c.id, c);
    }
  const ids = [...pool.keys()];
  const total = ids.length;
  const solved = ids.filter(id => done[id] === "ok").length;
  const attempted = ids.filter(id => id in done).length;
  const last = ids.reduce((mx, id) => Math.max(mx, srs[id]?.last || 0), 0);
  const pct = total ? solved / total : 0;
  // playable problems in this node still unsolved → recommendations
  const recs = (node.problems || []).filter(p => {
    const c = byTitle.get(p.title || p.name);
    return p.playable && c && done[c.id] !== "ok";
  });
  return { total, solved, attempted, last, pct, recs };
}

function statusOf(node, statsById, tree) {
  const s = statsById.get(node.id);
  if (s.total > 0 && s.pct >= 0.75) return "mastered";
  if (s.solved > 0 || s.attempted > 0) return "learning";
  const prereqsMet = (node.prereqs || []).every(pid => {
    const ps = statsById.get(pid);
    return ps && ps.total > 0 && ps.pct >= 0.5;
  });
  return prereqsMet || !node.prereqs?.length ? "available" : "locked";
}

/* ── tree layout (layered by tier) ───────────────────────────── */
function layout(tree) {
  const tiers = {};
  for (const n of tree.nodes) (tiers[n.tier] ??= []).push(n);
  const COLW = 210, ROWH = 92, NW = 176, NH = 60;
  const pos = {};
  const tierKeys = Object.keys(tiers).map(Number).sort((a, b) => a - b);
  let maxRows = 0;
  tierKeys.forEach((tk, ti) => {
    tiers[tk].forEach((n, ri) => { pos[n.id] = { x: ti * COLW, y: ri * ROWH }; });
    maxRows = Math.max(maxRows, tiers[tk].length);
  });
  return { pos, w: tierKeys.length * COLW, h: maxRows * ROWH, NW, NH };
}

/* ── render ──────────────────────────────────────────────────── */
let trees = [];
let active = 0;

function overallReadiness() {
  let total = 0, mastered = 0;
  for (const tree of trees) {
    const sById = new Map(tree.nodes.map(n => [n.id, nodeStats(n)]));
    for (const n of tree.nodes) {
      total++;
      if (statusOf(n, sById, tree) === "mastered") mastered++;
    }
  }
  return { total, mastered, pct: total ? mastered / total : 0 };
}

function polishQueue() {
  const items = [];
  for (const tree of trees) {
    const sById = new Map(tree.nodes.map(n => [n.id, nodeStats(n)]));
    for (const n of tree.nodes) {
      const st = statusOf(n, sById, tree);
      if (st === "available" || st === "learning") {
        const s = sById.get(n.id);
        // rank: unstarted & available first, then stale learning, then low pct
        const score = (st === "available" ? 100 : 0) + (Date.now() - (s.last || 0)) / 86400000 + (1 - s.pct) * 20;
        items.push({ tree, node: n, st, s, score });
      }
    }
  }
  return items.sort((a, b) => b.score - a.score).slice(0, 8);
}

function render() {
  const rd = overallReadiness();
  const tabs = trees.map((t, i) =>
    `<button class="sk-tab ${i === active ? "active" : ""}" data-i="${i}">${t.icon || "◆"} ${esc(t.name)}</button>`
  ).join("");

  root.innerHTML = `
    <div class="sk-head">
      <div class="sk-readiness">
        <div class="sk-ring" style="--pct:${Math.round(rd.pct * 100)}">
          <span>${Math.round(rd.pct * 100)}%</span>
        </div>
        <div>
          <div class="sk-readiness-title">interview readiness</div>
          <div class="sk-readiness-sub">${rd.mastered} / ${rd.total} skills mastered across ${trees.length} trees</div>
        </div>
      </div>
      <div class="sk-polish">
        <div class="sk-polish-title">▸ polish next</div>
        <div class="sk-polish-list" id="polish"></div>
      </div>
    </div>
    <nav class="sk-tabs">${tabs}</nav>
    <section class="sk-tree-wrap">
      <div class="sk-tree" id="treeStage"></div>
      <aside class="sk-detail" id="detail"><div class="sk-detail-empty">tap a skill node to see your progress, when you last practiced it, and what to do next</div></aside>
    </section>`;

  // polish queue
  const pol = polishQueue();
  document.getElementById("polish").innerHTML = pol.length ? pol.map(p =>
    `<button class="sk-polish-item" data-tree="${p.tree.id}" data-node="${p.node.id}">
      <span class="sk-dot ${p.st}"></span>
      <span class="sk-polish-name">${esc(p.node.name)}</span>
      <span class="sk-polish-meta">${p.st === "available" ? "start" : ago(p.s.last)}</span>
    </button>`).join("") : `<div class="sk-detail-empty">nothing queued — practice some cards in the feed to seed your skill map</div>`;

  document.querySelectorAll(".sk-tab").forEach(b => b.onclick = () => { active = +b.dataset.i; render(); });
  document.querySelectorAll(".sk-polish-item").forEach(b => b.onclick = () => {
    const ti = trees.findIndex(t => t.id === b.dataset.tree);
    if (ti >= 0) { active = ti; render(); setTimeout(() => selectNode(b.dataset.node), 30); }
  });

  renderTree(trees[active]);
}

function renderTree(tree) {
  const stage = document.getElementById("treeStage");
  const { pos, w, h, NW, NH } = layout(tree);
  const sById = new Map(tree.nodes.map(n => [n.id, nodeStats(n)]));
  const PAD = 20;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`);
  svg.setAttribute("width", w + PAD * 2);
  svg.setAttribute("height", h + PAD * 2);

  // edges
  for (const n of tree.nodes)
    for (const pid of n.prereqs || []) {
      if (!pos[pid]) continue;
      const a = pos[pid], b = pos[n.id];
      const line = document.createElementNS(NS, "path");
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      line.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      line.setAttribute("class", "sk-edge");
      svg.appendChild(line);
    }
  // nodes
  for (const n of tree.nodes) {
    const p = pos[n.id], st = statusOf(n, sById, tree), s = sById.get(n.id);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "sk-node " + st);
    g.setAttribute("transform", `translate(${p.x},${p.y})`);
    g.dataset.node = n.id;
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("width", NW); rect.setAttribute("height", NH); rect.setAttribute("rx", 10);
    g.appendChild(rect);
    const fill = document.createElementNS(NS, "rect");
    fill.setAttribute("class", "sk-node-fill");
    fill.setAttribute("width", Math.max(0, NW * s.pct)); fill.setAttribute("height", NH); fill.setAttribute("rx", 10);
    g.appendChild(fill);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", 12); t.setAttribute("y", NH / 2 - 2); t.setAttribute("class", "sk-node-name");
    t.textContent = n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name;
    g.appendChild(t);
    const t2 = document.createElementNS(NS, "text");
    t2.setAttribute("x", 12); t2.setAttribute("y", NH / 2 + 15); t2.setAttribute("class", "sk-node-meta");
    t2.textContent = st === "locked" ? "🔒 locked"
      : st === "mastered" ? "✓ mastered"
      : s.total ? `${s.solved}/${s.total} · ${ago(s.last)}` : "not started";
    g.appendChild(t2);
    g.onclick = () => selectNode(n.id);
    svg.appendChild(g);
  }
  stage.innerHTML = "";
  stage.appendChild(svg);
}

function selectNode(nodeId) {
  const tree = trees[active];
  const node = tree.nodes.find(n => n.id === nodeId);
  if (!node) return;
  document.querySelectorAll(".sk-node").forEach(g => g.classList.toggle("sel", g.dataset.node === nodeId));
  const s = nodeStats(node);
  const st = statusOf(node, new Map(tree.nodes.map(n => [n.id, nodeStats(n)])), tree);
  const probs = (node.problems || []).map(p => {
    const c = byTitle.get(p.title || p.name);
    const solved = c && done[c.id] === "ok";
    const link = p.playable && c ? `index.html?card=${encodeURIComponent(p.name)}` : null;
    const inner = `<span class="sk-prob-diff ${p.difficulty || ""}">${(p.difficulty || "?")[0].toUpperCase()}</span>
      ${esc(p.name)}
      ${p.playable ? '<span class="sk-badge play">playable</span>' : '<span class="sk-badge ref">ref</span>'}
      ${solved ? '<span class="sk-badge ok">✓</span>' : ""}`;
    return `<li class="${solved ? "solved" : ""}">${
      link ? `<a class="sk-prob-link" href="${link}">${inner}</a>` : inner}</li>`;
  }).join("");
  const practiceTags = (node.cardTags || []).join(",");
  document.getElementById("detail").innerHTML = `
    <div class="sk-detail-head">
      <span class="sk-dot ${st}"></span>
      <h2>${esc(node.name)}</h2>
    </div>
    <p class="sk-blurb">${esc(node.blurb || "")}</p>
    <div class="sk-bar"><div style="width:${Math.round(s.pct * 100)}%"></div></div>
    <div class="sk-stats">
      <span>${s.solved}/${s.total} solved</span>
      <span>last: <strong>${ago(s.last)}</strong></span>
      <span class="sk-status-${st}">${st}</span>
    </div>
    ${node.prereqs?.length ? `<div class="sk-prereqs">needs: ${node.prereqs.map(id => {
      const pn = tree.nodes.find(x => x.id === id); return pn ? esc(pn.name) : id;
    }).join(", ")}</div>` : ""}
    <div class="sk-prob-title">problems teaching this</div>
    <ul class="sk-probs">${probs || "<li>—</li>"}</ul>
    ${practiceTags ? `<a class="btn btn-check sk-practice" href="index.html?tags=${encodeURIComponent(practiceTags)}">practice this skill in feed ▸</a>` : ""}`;
}

/* ── boot ────────────────────────────────────────────────────── */
(async () => {
  try {
    const [skillsRes, bundleRes] = await Promise.all([
      fetchFirst(SRC("skills.json")),
      fetchFirst(SRC("bundle.md")),
    ]);
    trees = (await skillsRes.json()).trees || [];
    const cards = parseBundle(await bundleRes.text());
    for (const c of cards) {
      byTitle.set(c.title, c);
      for (const t of c.tags) { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(c); }
    }
    if (!trees.length) throw new Error("no skill trees");
    render();
  } catch (e) {
    root.innerHTML = `<div class="error-card">couldn't load skill trees: ${esc(String(e))}</div>`;
  }
})();
