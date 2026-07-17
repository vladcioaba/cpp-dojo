/* cpp-dojo — feed engine. No deps, no build. Highlighting from highlight.js (window.CPP). */

const { esc, inline, codeBlock } = window.CPP;

/* Content lives in a separate repo (cpp-dojo-datasets) and is served as one
   bundle by the backend, which proxies it from GitHub raw. Card types are
   explicit in each card header, so one file + one default type is enough.
   Fallbacks let the app still load if the backend proxy is unavailable. */
const WORKER = "https://cpp-dojo.vlad-cioaba.workers.dev";
const BUNDLE_SOURCES = [
  WORKER + "/content/bundle.md",  // fresh via backend proxy (works online in the native app too)
  "/content/bundle.md",           // same-origin on web
  "/offline/bundle.md",           // snapshot bundled into the app → works offline
  "../datasets/bundle.md",        // local dev via submodule
];

// absolute so the native app (loaded from a local bundle, not the Worker
// origin) still reaches the compile backend; on web it resolves same-origin
const API_RUN = WORKER + "/api/run";
const XP = { quizRight: 10, quizWrong: 2, exercise: 20, challenge: 50 };

/* ── state ───────────────────────────────────────────────────── */

const state = load();

function load() {
  try {
    return Object.assign({ xp: 0, streak: 0, lastDay: "", done: {}, srs: {} },
      JSON.parse(localStorage.getItem("cppdojo") || "{}"));
  } catch { return { xp: 0, streak: 0, lastDay: "", done: {}, srs: {} }; }
}
function save() { localStorage.setItem("cppdojo", JSON.stringify(state)); }

function dayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tickStreak() {
  const today = dayStr();
  if (state.lastDay === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  state.streak = state.lastDay === dayStr(y) ? state.streak + 1 : 1;
  state.lastDay = today;
  save();
}

/* ── markdown card parser ────────────────────────────────────── */

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function parseCards(text, defaultType) {
  const cards = [];
  const sections = text.split(/^## /m).slice(1); // drop intro
  for (const sec of sections) {
    const nl = sec.indexOf("\n");
    const head = sec.slice(0, nl).trim();
    let body = sec.slice(nl + 1);
    const m = head.match(/^(\w+):\s*(.*)$/);
    const type = m ? m[1] : defaultType;
    const title = m ? m[2] : head;

    const meta = {};
    body = body.replace(/^(tags|source|difficulty|track|lang):\s*(.+)$/gm, (_, k, v) => {
      meta[k] = v.trim(); return "";
    });
    // progressive hints + editorial (stripped before the id hash so adding
    // them to an existing card doesn't change its id / lose saved progress)
    const hints = [];
    body = body.replace(/^hint:\s*(.+)$/gm, (_, h) => { hints.push(h.trim()); return ""; });
    let editorial = "";
    body = body.replace(/\n?\*\*Editorial:\*\*\s*([\s\S]*)$/m, (_, e) => { editorial = e.trim(); return ""; });

    // collapse blank-line runs for the id hash so inserting hints/editorial
    // (which leave blank lines once stripped) doesn't shift a card's id
    const idBody = body.replace(/\n{3,}/g, "\n\n");
    cards.push({
      id: type + "-" + hash(head + idBody),
      type, title,
      track: meta.track || "core",
      difficulty: meta.difficulty || "",
      lang: meta.lang === "python" ? "python" : "cpp",
      tags: (meta.tags || "").split(",").map(t => t.trim()).filter(Boolean),
      hints, editorial,
      blocks: parseBlocks(body),
    });
  }
  return cards;
}

function parseBlocks(body) {
  const blocks = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      // starter/harness markers work for C++ (//) and Python (#) comments
      const starter = /^\s*(\/\/|#)\s*starter\b/.test(buf[0] || "");
      const harness = /^\s*(\/\/|#)\s*harness\b/.test(buf[0] || "");
      blocks.push({
        kind: "code",
        code: (starter || harness) ? buf.slice(1).join("\n") : buf.join("\n"),
        starter, harness,
      });
    } else if (/^- \[[ x]\] /.test(line)) {
      const opts = [];
      while (i < lines.length && /^- \[[ x]\] /.test(lines[i])) {
        opts.push({ text: lines[i].slice(6), right: lines[i][3] === "x" });
        i++;
      }
      blocks.push({ kind: "options", opts });
    } else if (/^> /.test(line)) {
      const buf = [];
      while (i < lines.length && /^> ?/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ""));
      blocks.push({ kind: "quote", text: buf.join(" ") });
    } else if (line.trim() === "") {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(```|- \[|> )/.test(lines[i])) buf.push(lines[i++]);
      blocks.push({ kind: "p", text: buf.join(" ") });
    }
  }
  return blocks;
}

/* ── rendering ───────────────────────────────────────────────── */

const feed = document.getElementById("feed");
const seenIO = new IntersectionObserver(
  es => es.forEach(e => e.isIntersecting && e.target.classList.add("seen")),
  { threshold: 0.15 }
);

/* one-card-at-a-time feed: card bodies are built lazily just before they
   scroll into view (building all ~700 up front froze the first paint) */
const hydrateIO = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) hydrateCard(e.target);
}, { root: feed, rootMargin: "200% 0px" });

function hydrateCard(el) {
  if (el._hydrated || !el._card) return;
  el._hydrated = true;
  hydrateIO.unobserve(el);
  const card = el._card, body = el.querySelector(".card-body");
  if (card.type === "quiz") renderQuiz(card, body, el._isReview);
  else if (card.type === "exercise") renderExercise(card, body);
  else if (card.type === "challenge") renderExercise(card, body, true);
  else if (card.type === "snippet") renderSnippet(card, body);
  else renderFact(card, body);
}

/* “N / M” position pill */
const posIO = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) {
    const pill = document.getElementById("posPill");
    if (pill) pill.textContent = `${e.target._idx + 1} / ${feed._count}`;
  }
}, { root: feed, threshold: 0.5 });

const FILE_EXT = { fact: "md", quiz: "cpp", exercise: "cpp", snippet: "cpp", challenge: "cpp" };
const FILE_STEM = { fact: "fact", quiz: "quiz", exercise: "drill", snippet: "snip", challenge: "chal" };

const liveTimers = new Set();  // challenge timers, cleared when the feed re-renders

function render(cards, isReview) {
  liveTimers.forEach(clearInterval);
  liveTimers.clear();
  feed.innerHTML = "";
  if (isReview && !cards.length) {
    feed.innerHTML = `<div class="review-empty">nothing due for review right now ✓<br>
      <span>miss a quiz or challenge and it comes back here on a spaced schedule</span></div>`;
    return;
  }
  if (!isReview && !cards.length) {
    feed.innerHTML = `<div class="review-empty">no cards match these filters<br>
      <span>tap a chip, or reset the track / difficulty</span></div>`;
    return;
  }
  cards.forEach((card, idx) => {
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.type = card.type;
    el.dataset.id = card.id;

    const done = state.done[card.id];
    const fname = `${FILE_STEM[card.type]}_${String(idx + 1).padStart(2, "0")}.${FILE_EXT[card.type]}`;
    const tags = card.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("");

    el.innerHTML = `
      <div class="card-tab">
        <span class="tab-dot"></span>
        <span class="tab-name">${fname}</span>
        <span class="tab-tags">${tags}${done ? '<span class="tab-done">✓</span>' : ""}</span>
      </div>
      <div class="card-body"><h2>${inline(card.title)}</h2></div>`;

    el._card = card;
    el._isReview = isReview;
    el._idx = idx;

    feed.appendChild(el);
    if (idx < 2) hydrateCard(el);   // first screens build instantly
    else hydrateIO.observe(el);
    seenIO.observe(el);
    posIO.observe(el);
  });
  feed._count = cards.length;
  const pill = document.getElementById("posPill");
  if (pill) { pill.hidden = cards.length === 0; pill.textContent = `1 / ${cards.length}`; }
}

function renderFact(card, body) {
  for (const b of card.blocks) {
    if (b.kind === "code") body.insertAdjacentHTML("beforeend", codeBlock(b.code));
    else if (b.kind === "p") body.insertAdjacentHTML("beforeend", `<p>${inline(b.text)}</p>`);
  }
}

function renderSnippet(card, body) {
  const analysis = [];
  for (const b of card.blocks) {
    if (b.kind === "code") body.insertAdjacentHTML("beforeend", codeBlock(b.code));
    else if (b.kind === "p") analysis.push(`<p>${inline(b.text)}</p>`);
  }
  if (analysis.length)
    body.insertAdjacentHTML("beforeend", `<div class="analysis">${analysis.join("")}</div>`);
}

function renderQuiz(card, body, isReview) {
  const optBlock = card.blocks.find(b => b.kind === "options");
  const quote = card.blocks.find(b => b.kind === "quote");
  for (const b of card.blocks) {
    if (b.kind === "code") body.insertAdjacentHTML("beforeend", codeBlock(b.code));
    else if (b.kind === "p") body.insertAdjacentHTML("beforeend", `<p>${inline(b.text)}</p>`);
  }
  if (!optBlock) return;

  const wrap = document.createElement("div");
  wrap.className = "options";
  // in the review queue a card is answerable again (so SRS can re-schedule it)
  const answered = !isReview && card.id in state.done;

  optBlock.opts.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.innerHTML = inline(opt.text);
    if (answered) {
      btn.disabled = true;
      if (opt.right) btn.classList.add("right");
    } else {
      btn.onclick = () => {
        wrap.querySelectorAll(".opt").forEach(b => (b.disabled = true));
        wrap.querySelectorAll(".opt").forEach((b, i) => {
          if (optBlock.opts[i].right) b.classList.add("right");
        });
        if (!opt.right) btn.classList.add("wrong");
        award(card.id, opt.right ? "ok" : "fail", opt.right ? XP.quizRight : XP.quizWrong, btn);
        if (quote) wrap.insertAdjacentHTML("afterend",
          `<div class="explain" role="status">${(opt.right ? "correct. " : "not quite. ") + inline(quote.text)}</div>`);
        markDone(card.id);
      };
    }
    wrap.appendChild(btn);
  });
  body.appendChild(wrap);
  if (answered && quote)
    body.insertAdjacentHTML("beforeend", `<div class="explain">${inline(quote.text)}</div>`);
}

/* Exercise: local string-match is the offline fallback; when the compile
   backend is reachable, the harness verdict (g++ + runtime PASS) wins. */
function renderExercise(card, body, isChallenge) {
  const codes = card.blocks.filter(b => b.kind === "code");
  const starter = codes.find(b => b.starter);
  const harness = codes.find(b => b.harness);
  const solution = codes.filter(b => !b.starter && !b.harness).pop();
  const xpReward = isChallenge ? XP.challenge : XP.exercise;

  for (const b of card.blocks) {
    if (b.kind === "p") body.insertAdjacentHTML("beforeend", `<p>${inline(b.text)}</p>`);
  }
  if (starter) body.insertAdjacentHTML("beforeend", codeBlock(starter.code));

  const ta = document.createElement("textarea");
  ta.className = "editor";
  ta.placeholder = "// type your C++ here";
  ta.spellcheck = false;
  // stop mobile keyboards from mangling code (capitalizing keywords, smart quotes)
  ta.autocapitalize = "none";
  ta.setAttribute("autocorrect", "off");
  ta.autocomplete = "off";

  // Challenge timer: counts up from the first keystroke, freezes on pass.
  let timerEl = null, t0 = 0, tick = null;
  const bestKey = "t:" + card.id;
  if (isChallenge) {
    timerEl = document.createElement("span");
    timerEl.className = "chal-timer";
    const best = state.done[bestKey];
    timerEl.textContent = best ? `best ${best}s` : "0.0s";
    ta.addEventListener("input", () => {
      if (t0 || state.done[card.id] === "ok") return;
      t0 = performance.now();
      tick = setInterval(() => {
        timerEl.textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s";
      }, 100);
      liveTimers.add(tick);
    }, { once: false });
  }

  const actions = document.createElement("div");
  actions.className = "ex-actions";
  const check = document.createElement("button");
  check.className = "btn btn-check";
  check.textContent = "compile ▸";

  // progressive hints — reveal one at a time before falling back to the solution
  let hintBox = null, hintBtn = null, shownHints = 0;
  if (card.hints && card.hints.length) {
    hintBtn = document.createElement("button");
    hintBtn.className = "btn btn-hint";
    hintBtn.textContent = `hint (${card.hints.length})`;
    hintBox = document.createElement("div");
    hintBox.className = "hints";
    hintBox.hidden = true;
    hintBtn.onclick = () => {
      // hints exhausted → this button becomes the solution reveal (the old
      // label said "solution below" while the solution stayed hidden)
      if (shownHints >= card.hints.length) {
        solWrap.hidden = false;
        solWrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
      hintBox.hidden = false;
      hintBox.insertAdjacentHTML("beforeend",
        `<div class="hint"><span class="hint-n">${shownHints + 1}</span>${inline(card.hints[shownHints])}</div>`);
      shownHints++;
      hintBtn.textContent = shownHints < card.hints.length
        ? `next hint (${shownHints}/${card.hints.length})` : "show solution ↓";
    };
  }

  const reveal = document.createElement("button");
  reveal.className = "btn";
  reveal.textContent = "show solution";
  const verdict = document.createElement("span");
  verdict.className = "verdict";
  verdict.setAttribute("aria-live", "polite");  // announce pass/fail to screen readers
  actions.append(check);
  if (hintBtn) actions.append(hintBtn);
  actions.append(reveal, verdict);
  if (timerEl) actions.append(timerEl);

  const out = document.createElement("pre");
  out.className = "compile-out";
  out.setAttribute("aria-live", "polite");
  out.hidden = true;

  const solWrap = document.createElement("div");
  solWrap.className = "solution";
  solWrap.hidden = true;
  if (solution)
    solWrap.innerHTML = `<div class="solution-label">solution</div>` + codeBlock(solution.code)
      + (card.editorial ? `<div class="editorial"><span class="editorial-label">editorial</span>${inline(card.editorial)}</div>` : "");

  if (state.done[card.id] === "ok") {
    verdict.textContent = "✓ passed";
    verdict.className = "verdict ok";
  }

  const pass = () => {
    verdict.textContent = "✓ 0 errors, 0 warnings";
    verdict.className = "verdict ok";
    const first = state.done[card.id] !== "ok";
    if (first) award(card.id, "ok", xpReward, check);
    if (timerEl && t0) {
      clearInterval(tick);
      const secs = +((performance.now() - t0) / 1000).toFixed(1);
      const prev = state.done[bestKey];
      if (prev == null || secs < prev) { state.done[bestKey] = secs; save(); }
      timerEl.textContent = `solved ${secs}s · best ${state.done[bestKey]}s`;
    }
    markDone(card.id);
  };

  const py = card.lang === "python";
  const runCmd = py ? "python3 main.py" : "g++ -std=c++20 main.cpp && ./a.out";
  check.onclick = async () => {
    if (!solution) return;
    if (harness) {
      verdict.textContent = py ? "⧗ running…" : "⧗ compiling…";
      verdict.className = "verdict";
      check.disabled = true;
      const marker = py ? "#__USER__" : "//__USER__";
      const res = await compileRun(harness.code.replace(marker, () => ta.value), card.lang);
      check.disabled = false;
      if (res) {
        out.hidden = false;
        if (!res.compile.ok) {
          out.textContent = "$ g++ -std=c++20 main.cpp\n" + res.compile.stderr.trim();
          verdict.textContent = "✗ compile error";
          verdict.className = "verdict no";
        } else if (res.run.exit === 0 && /\bPASS\b/.test(res.run.stdout)) {
          out.textContent = "$ " + runCmd + "\n" + res.run.stdout.trim();
          pass();
        } else {
          out.textContent = "$ " + runCmd + "\n" + (res.run.stdout + "\n" + res.run.stderr).trim() +
            `\n[exit ${res.run.exit}]`;
          verdict.textContent = "✗ runtime check failed";
          verdict.className = "verdict no";
        }
        return;
      }
      // backend unreachable → fall through to offline similarity check
    }
    const sim = similarity(ta.value, solution.code);
    const pctStr = Math.round(sim * 100) + "% match";
    out.hidden = false;
    if (sim >= 0.82) {
      out.textContent = `⚠ offline — no compiler. Text similarity ${pctStr} vs the reference (looks right).`;
      pass();
    } else if (sim >= 0.55) {
      out.textContent = `⚠ offline — no compiler. Text similarity ${pctStr} — close, compare with the solution.`;
      verdict.textContent = `≈ ${pctStr} (offline)`;
      verdict.className = "verdict";
    } else {
      out.textContent = `⚠ offline — no compiler. Text similarity ${pctStr} — doesn't match yet.`;
      verdict.textContent = "✗ doesn't match yet";
      verdict.className = "verdict no";
    }
  };
  reveal.onclick = () => { solWrap.hidden = !solWrap.hidden; };

  body.append(ta, actions);
  if (hintBox) body.append(hintBox);
  body.append(out, solWrap);
}

async function compileRun(code, lang) {
  try {
    const r = await fetch(API_RUN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, lang: lang || "cpp" }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function norm(code) {
  return code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, "");
}

/* Offline check — when the compile backend is unreachable (e.g. on mobile
   with no connection), compare the user's code to the reference solution by
   text similarity instead of requiring an exact match. Dice coefficient over
   character bigrams of the normalized code: order-tolerant, cheap, forgiving
   of a differently-but-correctly written solution. */
function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}
function similarity(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na), bb = bigrams(nb);
  let inter = 0;
  for (const [g, ca] of ba) inter += Math.min(ca, bb.get(g) || 0);
  return (2 * inter) / (na.length - 1 + nb.length - 1);
}

function markDone(id) {
  const tab = feed.querySelector(`.card[data-id="${id}"] .tab-tags`);
  if (tab && !tab.querySelector(".tab-done"))
    tab.insertAdjacentHTML("beforeend", '<span class="tab-done">✓</span>');
}

/* leaderboard sync — prefers a logged-in account session (cppdojo-auth),
   falls back to the anonymous handle (cppdojo-profile). Both set on /ranks. */
let syncTimer = null;
function syncScore() {
  let body = null;
  try {
    const a = JSON.parse(localStorage.getItem("cppdojo-auth") || "null");
    if (a) body = { session: a.session, xp: state.xp, streak: state.streak };
    else {
      const p = JSON.parse(localStorage.getItem("cppdojo-profile") || "null");
      if (p) body = { token: p.token, name: p.name, xp: state.xp, streak: state.streak };
    }
  } catch { }
  if (!body) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch(WORKER + "/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, 1500);
}

/* ── spaced repetition (SM-2 lite) ───────────────────────────── */
const DAY_MS = 86400000;
const REVIEWABLE = new Set(["quiz", "exercise", "challenge"]);

function srsReview(id, correct) {
  if (!REVIEWABLE.has(id.split("-")[0])) return;
  const s = state.srs[id] || { interval: 0, ease: 2.3, reps: 0, lapses: 0, due: 0 };
  if (correct) {
    s.reps += 1;
    s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ease);
    s.ease = Math.min(2.8, s.ease + 0.1);
  } else {
    s.reps = 0;
    s.lapses += 1;
    s.interval = 0;            // resurface within the same session
    s.ease = Math.max(1.3, s.ease - 0.2);
  }
  s.last = Date.now();              // powers the "last practiced" ticker
  s.due = s.last + (s.interval === 0 ? 10 * 60 * 1000 : s.interval * DAY_MS);
  state.srs[id] = s;
  save();
}

function dueIds() {
  const now = Date.now();
  return new Set(Object.keys(state.srs).filter(id => state.srs[id].due <= now));
}

function updateDueBadge() {
  const el = document.getElementById("dueCount");
  if (!el) return;
  const n = dueIds().size;
  el.textContent = n ? String(n) : "";
  el.hidden = !n;
}

function award(id, status, xp, anchorEl) {
  state.done[id] = status;
  state.xp += xp;
  srsReview(id, status === "ok");
  save();
  syncScore();
  updateDueBadge();
  document.getElementById("xp").textContent = state.xp;
  if (anchorEl && xp > 0) {
    const r = anchorEl.getBoundingClientRect();
    const f = document.createElement("span");
    f.className = "xp-float";
    f.textContent = `+${xp} xp`;
    f.style.left = r.right + 8 + "px";
    f.style.top = r.top + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
}

/* ── daily shuffle ───────────────────────────────────────────── */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailyMix(cards) {
  const rnd = mulberry32(parseInt(hash(dayStr()), 36));
  const byType = {};
  for (const c of cards) (byType[c.type] ??= []).push(c);
  for (const list of Object.values(byType)) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  // round-robin interleave so the feed alternates card types
  const order = Object.keys(byType).sort(() => rnd() - 0.5);
  const mix = [];
  let added = true;
  while (added) {
    added = false;
    for (const t of order) {
      const c = byType[t].shift();
      if (c) { mix.push(c); added = true; }
    }
  }
  return mix;
}

/* ── boot ────────────────────────────────────────────────────── */

let allCards = [];
let filter = localStorage.getItem("cppdojo-typefilter") || "all"; // set here or on the filter tab
// track cycles the whole feed through topic tracks
const CPP_TRACKS = ["core", "faang", "hft", "design"]; // everything written in C++
const TRACKS = [
  { id: "all", label: "◆ all tracks", title: "showing all cards — tap to focus a track" },
  { id: "cpp", label: "⚙ C++", title: "all C++ cards (core, FAANG, HFT, design)",
    match: c => CPP_TRACKS.includes(c.track) },
  { id: "python", label: "🐍 Python", title: "Python — runs on the backend" },
  { id: "fpga", label: "🔧 FPGA", title: "FPGA / hardware only" },
  { id: "quant", label: "📊 quant", title: "probability & mental-math only" },
  { id: "faang", label: "💼 FAANG", title: "LeetCode-style DS&A only" },
  { id: "hft", label: "⚡ HFT C++", title: "low-latency C++ only" },
  { id: "design", label: "🏛 design", title: "OOP, patterns & architecture only" },
];
const trackMatch = c => {
  if (track === "all") return true;
  const t = TRACKS.find(x => x.id === track);
  return t?.match ? t.match(c) : c.track === track;
};
let track = localStorage.getItem("cppdojo-track") || "all";

/* deep-link from the skills page: ?tags=a,b filters the feed to a skill's
   cards; ?card=Title opens one problem. Cleared by tapping a filter chip. */
const _params = new URLSearchParams(location.search);
let tagFilter = (_params.get("tags") || "").split(",").map(s => s.trim()).filter(Boolean);
const cardFocus = _params.get("card");

let difficulty = localStorage.getItem("cppdojo-diff") || "all"; // all | easy | medium | hard

function applyFilters() {
  let cards = allCards;
  if (track !== "all") cards = cards.filter(trackMatch);
  if (tagFilter.length) cards = cards.filter(c => c.tags.some(t => tagFilter.includes(t)));
  if (difficulty !== "all") cards = cards.filter(c => c.difficulty === difficulty);
  if (filter === "review") {
    const due = dueIds();
    cards = cards.filter(c => due.has(c.id));
  } else if (filter !== "all") {
    cards = cards.filter(c => c.type === filter);
  }
  const applyBtn = document.getElementById("sheetApply");
  if (applyBtn) applyBtn.textContent = `show ${cards.length} card${cards.length === 1 ? "" : "s"} ▸`;
  render(cards, filter === "review");
  renderDeepLinkBanner();
  feed.scrollTop = 0;
}

function renderDeepLinkBanner() {
  document.getElementById("dlBanner")?.remove();
  if (!tagFilter.length) return;
  const b = document.createElement("div");
  b.id = "dlBanner";
  b.className = "dl-banner";
  b.innerHTML = `<span>practicing skill: <strong>${esc(tagFilter.join(", "))}</strong></span>
    <button id="dlClear">show all ✕</button>`;
  feed.prepend(b);
  document.getElementById("dlClear").onclick = () => {
    tagFilter = [];
    history.replaceState(null, "", location.pathname);
    applyFilters();
  };
}

document.querySelectorAll("#chips .chip").forEach(c => {
  const on = c.dataset.filter === filter;
  c.classList.toggle("active", on);
  c.setAttribute("aria-pressed", on);
});
document.getElementById("chips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#chips .chip").forEach(c => {
    c.classList.toggle("active", c === chip);
    c.setAttribute("aria-pressed", c === chip);
  });
  filter = chip.dataset.filter;
  localStorage.setItem("cppdojo-typefilter", filter);
  tagFilter = []; // an explicit chip choice clears a skill deep-link
  applyFilters();
});

/* Difficulty: header button cycles it; the panel's chips set it directly.
   Both repaint through one place. */
const DIFFS = [
  { id: "all", label: "◇ any level" },
  { id: "easy", label: "● easy" },
  { id: "medium", label: "● medium" },
  { id: "hard", label: "● hard" },
];
const diffBtn = document.getElementById("diffToggle");
const diffChips = document.getElementById("diffChips");
function paintDifficulty() {
  if (diffBtn) {
    const d = DIFFS.find(x => x.id === difficulty) || DIFFS[0];
    diffBtn.textContent = d.label;
    diffBtn.className = "stat diff-btn" + (difficulty === "all" ? "" : " diff-" + difficulty);
    diffBtn.setAttribute("aria-pressed", difficulty !== "all");
  }
  diffChips?.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("active", c.dataset.diff === difficulty);
    c.setAttribute("aria-pressed", c.dataset.diff === difficulty);
  });
}
function setDifficulty(id) { difficulty = id; localStorage.setItem("cppdojo-diff", id); paintDifficulty(); applyFilters(); }
if (diffBtn) diffBtn.onclick = () => {
  const i = DIFFS.findIndex(x => x.id === difficulty);
  setDifficulty(DIFFS[(i + 1) % DIFFS.length].id);
};
if (diffChips) {
  diffChips.innerHTML = DIFFS.map(d => `<button class="chip" data-diff="${d.id}">${d.label}</button>`).join("");
  diffChips.addEventListener("click", e => {
    const c = e.target.closest(".chip");
    if (c) setDifficulty(c.dataset.diff);
  });
}
paintDifficulty();

/* ── the ⚙ panel: stats + all filters live behind the top-right button ── */
const panelBtn = document.getElementById("panelBtn");
const sheet = document.getElementById("filterSheet");
const sheetBackdrop = document.getElementById("sheetBackdrop");
if (panelBtn && sheet) {
  // on phones the header stats strip moves into the panel
  if (matchMedia("(max-width: 640px)").matches) {
    const st = document.querySelector(".topbar .stats");
    if (st) sheet.prepend(st);
  }
  const openSheet = o => {
    sheet.classList.toggle("open", o);
    if (sheetBackdrop) sheetBackdrop.hidden = !o;
    panelBtn.setAttribute("aria-expanded", String(o));
  };
  panelBtn.onclick = () => openSheet(!sheet.classList.contains("open"));
  sheetBackdrop?.addEventListener("click", () => openSheet(false));
  document.getElementById("sheetApply")?.addEventListener("click", () => openSheet(false));
}

/* Track filter: visible chip row (language/topic) + header button that
   cycles the same list. Both share one state and stay in sync. */
const modeBtn = document.getElementById("modeToggle");
const trackChips = document.getElementById("trackChips");

function paintTrack() {
  const t = TRACKS.find(x => x.id === track) || TRACKS[0];
  if (modeBtn) {
    modeBtn.classList.toggle("on", track !== "all");
    modeBtn.setAttribute("aria-pressed", track !== "all");
    modeBtn.textContent = t.label;
    modeBtn.title = t.title;
  }
  trackChips?.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("active", c.dataset.track === track);
    c.setAttribute("aria-pressed", c.dataset.track === track);
  });
}
function setTrack(id) {
  track = id;
  localStorage.setItem("cppdojo-track", track);
  paintTrack();
  applyFilters();
}
if (trackChips) {
  trackChips.innerHTML = TRACKS.map(t =>
    `<button class="chip" data-track="${t.id}" title="${esc(t.title)}">${t.label}</button>`).join("");
  trackChips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) setTrack(chip.dataset.track);
  });
}
if (modeBtn) modeBtn.onclick = () => {
  const idx = TRACKS.findIndex(x => x.id === track);
  setTrack(TRACKS[(idx + 1) % TRACKS.length].id);
};
paintTrack();

document.addEventListener("keydown", e => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (e.key !== "j" && e.key !== "k") return;
  const cards = [...feed.querySelectorAll(".card")];
  const top = feed.getBoundingClientRect().top;
  let cur = cards.findIndex(c => c.getBoundingClientRect().top > top + 30);
  if (cur === -1) cur = cards.length;
  const next = e.key === "j" ? cur : cur - 2;
  cards[Math.max(0, Math.min(cards.length - 1, next))]?.scrollIntoView({ block: "start" });
});

async function fetchBundle() {
  for (const url of BUNDLE_SOURCES) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.text();
    } catch { /* next source */ }
  }
  throw new Error("all bundle sources failed");
}

async function boot() {
  tickStreak();
  document.getElementById("streak").textContent = state.streak;
  document.getElementById("xp").textContent = state.xp;
  if (state.streak > 0) document.querySelector(".stat-streak").classList.add("lit");
  document.getElementById("daymix").textContent = `mix of ${dayStr()}`;
  syncScore(); // streak may have ticked — push it to the board

  try {
    const text = await fetchBundle();
    // every card header carries its explicit type, so one parse pass suffices
    allCards = dailyMix(parseCards(text, "fact"));
    if (!allCards.length) throw new Error("no content loaded");
    updateDueBadge();
    applyFilters();
    if (cardFocus) {
      const target = allCards.find(c => c.title === cardFocus);
      const el = target && feed.querySelector(`.card[data-id="${target.id}"]`);
      if (el) { hydrateCard(el); el.scrollIntoView({ block: "start" }); el.classList.add("focused"); }
    }
  } catch (err) {
    feed.innerHTML = `<div class="error-card">failed to load content: ${esc(String(err))}<br><br>
      content is served by the backend from the datasets repo — check your network.</div>`;
  }
}

boot();
