/* cpp-dojo — feed engine. No deps, no build. */

const FILES = [
  ["fact", "content/facts.md"],
  ["quiz", "content/quizzes.md"],
  ["exercise", "content/exercises.md"],
  ["snippet", "content/snippets.md"],
];

const XP = { quizRight: 10, quizWrong: 2, exercise: 20 };

/* ── state ───────────────────────────────────────────────────── */

const state = load();

function load() {
  try {
    return Object.assign({ xp: 0, streak: 0, lastDay: "", done: {} },
      JSON.parse(localStorage.getItem("cppdojo") || "{}"));
  } catch { return { xp: 0, streak: 0, lastDay: "", done: {} }; }
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
    body = body.replace(/^(tags|source|difficulty):\s*(.+)$/gm, (_, k, v) => {
      meta[k] = v.trim(); return "";
    });

    cards.push({
      id: type + "-" + hash(head + body),
      type, title,
      tags: (meta.tags || "").split(",").map(t => t.trim()).filter(Boolean),
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
      const code = buf.join("\n");
      const starter = /^\s*\/\/\s*starter\b/.test(buf[0] || "");
      blocks.push({ kind: "code", code: starter ? buf.slice(1).join("\n") : code, starter });
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

/* ── inline markdown + C++ highlighter ───────────────────────── */

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

const KW = new RegExp("\\b(" + (
  "alignas alignof auto bool break case catch char char8_t char16_t char32_t class concept const " +
  "consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default " +
  "delete do double dynamic_cast else enum explicit export extern false final float for friend goto " +
  "if inline int long mutable namespace new noexcept nullptr operator override private protected " +
  "public reinterpret_cast requires return short signed sizeof static static_assert static_cast " +
  "struct switch template this thread_local throw true try typedef typeid typename union unsigned " +
  "using virtual void volatile wchar_t while"
).trim().split(/\s+/).join("|") + ")\\b", "g");

const TYPES = /\b(std|string_view|string|vector|map|set|unique_ptr|shared_ptr|weak_ptr|enable_shared_from_this|function|variant|optional|mutex|lock_guard|jthread|fstream|FILE|size_t|ptrdiff_t|chrono|steady_clock|time_point|milliseconds|duration_cast|cout|cin|endl|make_unique|make_shared|move|visit|sort|views|reverse|less|is_integral_v)\b/g;

const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#[^\n]*)/gm;

function highlight(code) {
  let out = "", last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    out += plain(code.slice(last, m.index));
    if (m[1]) out += `<span class="tk-c">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tk-s">${esc(m[2])}</span>`;
    else out += `<span class="tk-p">${esc(m[3])}</span>`;
    last = m.index + m[0].length;
  }
  out += plain(code.slice(last));
  return out;
}

function plain(s) {
  return esc(s)
    .replace(KW, '<span class="tk-k">$1</span>')
    .replace(TYPES, '<span class="tk-t">$1</span>')
    .replace(/\b(\d[\d.'xXbBa-fA-F]*)\b/g, '<span class="tk-n">$1</span>');
}

function codeBlock(code) {
  const lines = code.split("\n");
  const gutter = lines.map((_, i) => i + 1).join("\n");
  return `<div class="code"><div class="gutter">${gutter}</div><pre>${highlight(code)}</pre></div>`;
}

/* ── rendering ───────────────────────────────────────────────── */

const feed = document.getElementById("feed");
const seenIO = new IntersectionObserver(
  es => es.forEach(e => e.isIntersecting && e.target.classList.add("seen")),
  { threshold: 0.15 }
);

const FILE_EXT = { fact: "md", quiz: "cpp", exercise: "cpp", snippet: "cpp" };
const FILE_STEM = { fact: "fact", quiz: "quiz", exercise: "drill", snippet: "snip" };

function render(cards) {
  feed.innerHTML = "";
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

    const body = el.querySelector(".card-body");
    if (card.type === "quiz") renderQuiz(card, body);
    else if (card.type === "exercise") renderExercise(card, body);
    else if (card.type === "snippet") renderSnippet(card, body);
    else renderFact(card, body);

    feed.appendChild(el);
    seenIO.observe(el);
  });
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

function renderQuiz(card, body) {
  const optBlock = card.blocks.find(b => b.kind === "options");
  const quote = card.blocks.find(b => b.kind === "quote");
  for (const b of card.blocks) {
    if (b.kind === "code") body.insertAdjacentHTML("beforeend", codeBlock(b.code));
    else if (b.kind === "p") body.insertAdjacentHTML("beforeend", `<p>${inline(b.text)}</p>`);
  }
  if (!optBlock) return;

  const wrap = document.createElement("div");
  wrap.className = "options";
  const answered = card.id in state.done;

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
        if (quote) wrap.insertAdjacentHTML("afterend", `<div class="explain">${inline(quote.text)}</div>`);
        markDone(card.id);
      };
    }
    wrap.appendChild(btn);
  });
  body.appendChild(wrap);
  if (answered && quote)
    body.insertAdjacentHTML("beforeend", `<div class="explain">${inline(quote.text)}</div>`);
}

function renderExercise(card, body) {
  const codes = card.blocks.filter(b => b.kind === "code");
  const starter = codes.find(b => b.starter);
  const solution = codes.filter(b => !b.starter).pop();

  for (const b of card.blocks) {
    if (b.kind === "p") body.insertAdjacentHTML("beforeend", `<p>${inline(b.text)}</p>`);
  }
  if (starter) body.insertAdjacentHTML("beforeend", codeBlock(starter.code));

  const ta = document.createElement("textarea");
  ta.className = "editor";
  ta.placeholder = "// type your C++ here";
  ta.spellcheck = false;

  const actions = document.createElement("div");
  actions.className = "ex-actions";
  const check = document.createElement("button");
  check.className = "btn btn-check";
  check.textContent = "compile ▸";
  const reveal = document.createElement("button");
  reveal.className = "btn";
  reveal.textContent = "show solution";
  const verdict = document.createElement("span");
  verdict.className = "verdict";
  actions.append(check, reveal, verdict);

  const solWrap = document.createElement("div");
  solWrap.className = "solution";
  solWrap.hidden = true;
  if (solution)
    solWrap.innerHTML = `<div class="solution-label">solution</div>` + codeBlock(solution.code);

  if (state.done[card.id] === "ok") {
    verdict.textContent = "✓ passed";
    verdict.className = "verdict ok";
  }

  check.onclick = () => {
    if (!solution) return;
    if (norm(ta.value) === norm(solution.code)) {
      verdict.textContent = "✓ 0 errors, 0 warnings";
      verdict.className = "verdict ok";
      if (state.done[card.id] !== "ok") award(card.id, "ok", XP.exercise, check);
      markDone(card.id);
    } else {
      verdict.textContent = "✗ doesn't match yet";
      verdict.className = "verdict no";
    }
  };
  reveal.onclick = () => { solWrap.hidden = !solWrap.hidden; };

  body.append(ta, actions, solWrap);
}

function norm(code) {
  return code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, "");
}

function markDone(id) {
  const tab = feed.querySelector(`.card[data-id="${id}"] .tab-tags`);
  if (tab && !tab.querySelector(".tab-done"))
    tab.insertAdjacentHTML("beforeend", '<span class="tab-done">✓</span>');
}

function award(id, status, xp, anchorEl) {
  state.done[id] = status;
  state.xp += xp;
  save();
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
let filter = "all";

document.getElementById("chips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === chip));
  filter = chip.dataset.filter;
  render(filter === "all" ? allCards : allCards.filter(c => c.type === filter));
  feed.scrollTop = 0;
});

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

async function boot() {
  tickStreak();
  document.getElementById("streak").textContent = state.streak;
  document.getElementById("xp").textContent = state.xp;
  if (state.streak > 0) document.querySelector(".stat-streak").classList.add("lit");
  document.getElementById("daymix").textContent = `mix of ${dayStr()}`;

  try {
    const texts = await Promise.all(
      FILES.map(([type, path]) =>
        fetch(path).then(r => {
          if (!r.ok) throw new Error(path + " → " + r.status);
          return r.text().then(t => [type, t]);
        })
      )
    );
    allCards = dailyMix(texts.flatMap(([type, t]) => parseCards(t, type)));
    render(allCards);
  } catch (err) {
    feed.innerHTML = `<div class="error-card">failed to load content: ${esc(String(err))}<br><br>
      if you opened index.html directly, serve it instead:<br>
      <strong>python3 -m http.server 8000</strong> → http://localhost:8000</div>`;
  }
}

boot();
