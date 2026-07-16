/* cpp-dojo — sprint: timed drills against the clock.
   Two modes: arithmetic (generated, Optiver-style) and quiz (from a track). */

const { esc, inline, codeBlock } = window.CPP;
const root = document.getElementById("sprintRoot");

/* content comes from the one bundle the backend serves (datasets repo) */
const BUNDLE_SOURCES = [
  "https://cpp-dojo.vlad-cioaba.workers.dev/content/bundle.md",
  "/content/bundle.md",
  "/offline/bundle.md",
  "../datasets/bundle.md",
];
// which card tracks feed each sprint track ("mock" = mixed gauntlet)
const TRACK_MATCH = {
  hft: c => c.track === "hft",
  quant: c => c.track === "quant",
  fpga: c => c.track === "fpga",
  design: c => c.track === "design",
  core: c => !c.track || c.track === "core",
  mock: () => true,
};
let _bundle = null;
async function loadContent() {
  if (_bundle) return _bundle;
  for (const url of BUNDLE_SOURCES) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const text = await r.text();
        return (_bundle = { quizzes: parseQuizzes(text), challenges: parseChallenges(text) });
      }
    } catch { /* next */ }
  }
  return (_bundle = { quizzes: [], challenges: [] });
}
async function loadQuizzes() { return (await loadContent()).quizzes; }

/* ── best-score store ────────────────────────────────────────── */
function bests() {
  try { return JSON.parse(localStorage.getItem("cppdojo-sprint") || "{}"); }
  catch { return {}; }
}
function saveBest(key, rec) {
  const b = bests(); b[key] = rec;
  localStorage.setItem("cppdojo-sprint", JSON.stringify(b));
}

/* ── setup screen ────────────────────────────────────────────── */
function setup() {
  const b = bests();
  const bestLine = k => b[k] ? `<span class="sp-best">best ${b[k].label}</span>` : "";
  root.innerHTML = `
    <section class="sp-card">
      <h1 class="sp-title">sprint</h1>
      <p class="sp-sub">Beat the clock. Mental math like the Optiver test, or a timed quiz round from any track.</p>

      <div class="sp-group">
        <div class="sp-group-head">⚡ arithmetic ${bestLine("arith")}</div>
        <div class="sp-opts" id="arithOpts">
          <button class="sp-opt" data-diff="easy">easy<span>2-digit + −, 1-digit ×</span></button>
          <button class="sp-opt active" data-diff="medium">medium<span>2-digit + − ×</span></button>
          <button class="sp-opt" data-diff="hard">hard<span>2-digit ×, 3-digit + −</span></button>
        </div>
        <div class="sp-row">
          <label>questions <select id="arithN"><option>10</option><option selected>20</option><option>40</option></select></label>
          <button class="btn btn-check" id="startArith">start ▸</button>
        </div>
      </div>

      <div class="sp-group">
        <div class="sp-group-head">🎙 mock interview ${bestLine("interview")}</div>
        <p class="sp-sub">Three real problems — easy, medium, hard — against a countdown. Code compiles and runs on the backend; PASS advances.</p>
        <div class="sp-opts" id="ivOpts">
          <button class="sp-opt active" data-iv="cpp">⚙ C++</button>
          <button class="sp-opt" data-iv="python">🐍 Python</button>
          <button class="sp-opt" data-iv="hft">⚡ HFT</button>
        </div>
        <div class="sp-row">
          <label>clock <select id="ivMin"><option>30</option><option selected>45</option><option>60</option></select> min</label>
          <button class="btn btn-check" id="startIv">start interview ▸</button>
        </div>
      </div>

      <div class="sp-group">
        <div class="sp-group-head">📝 quiz round ${bestLine("quiz:mock")}</div>
        <div class="sp-opts" id="trackOpts">
          <button class="sp-opt active" data-track="mock">🎯 mock (mixed)</button>
          <button class="sp-opt" data-track="hft">HFT C++</button>
          <button class="sp-opt" data-track="quant">quant</button>
          <button class="sp-opt" data-track="fpga">FPGA</button>
          <button class="sp-opt" data-track="design">design</button>
          <button class="sp-opt" data-track="core">core C++</button>
        </div>
        <div class="sp-row">
          <label>questions <select id="quizN"><option selected>10</option><option>15</option><option>20</option></select></label>
          <button class="btn btn-check" id="startQuiz">start ▸</button>
        </div>
      </div>
    </section>`;

  wireOpts("arithOpts");
  wireOpts("trackOpts");
  wireOpts("ivOpts");
  document.getElementById("startIv").onclick = () => {
    const pool = document.querySelector("#ivOpts .sp-opt.active").dataset.iv;
    const mins = +document.getElementById("ivMin").value;
    runInterview(pool, mins);
  };
  document.getElementById("startArith").onclick = () => {
    const diff = document.querySelector("#arithOpts .sp-opt.active").dataset.diff;
    const n = +document.getElementById("arithN").value;
    runArith(diff, n);
  };
  document.getElementById("startQuiz").onclick = () => {
    const track = document.querySelector("#trackOpts .sp-opt.active").dataset.track;
    const n = +document.getElementById("quizN").value;
    runQuiz(track, n);
  };
}
function wireOpts(id) {
  const box = document.getElementById(id);
  box.querySelectorAll(".sp-opt").forEach(o => o.onclick = () => {
    box.querySelectorAll(".sp-opt").forEach(x => x.classList.remove("active"));
    o.classList.add("active");
  });
}

/* ── clock ───────────────────────────────────────────────────── */
function makeClock(el) {
  const t0 = performance.now();
  const iv = setInterval(() => {
    el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s";
  }, 100);
  return { stop: () => { clearInterval(iv); return (performance.now() - t0) / 1000; } };
}

/* ── arithmetic sprint ───────────────────────────────────────── */
function genQ(diff) {
  const r = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  let a, b, op;
  const ops = { easy: ["+", "-", "*"], medium: ["+", "-", "*"], hard: ["+", "-", "*"] };
  op = ops[diff][r(0, 2)];
  if (op === "*") {
    if (diff === "easy") { a = r(2, 9); b = r(2, 9); }
    else if (diff === "medium") { a = r(6, 19); b = r(3, 12); }
    else { a = r(12, 49); b = r(11, 29); }
  } else {
    if (diff === "easy") { a = r(10, 99); b = r(10, 99); }
    else if (diff === "medium") { a = r(20, 199); b = r(10, 99); }
    else { a = r(100, 999); b = r(50, 499); }
    if (op === "-" && b > a) [a, b] = [b, a]; // keep answers non-negative
  }
  const ans = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return { text: `${a} ${op === "*" ? "×" : op} ${b}`, ans };
}

function runArith(diff, n) {
  let i = 0, correct = 0;
  const qs = Array.from({ length: n }, () => genQ(diff));
  root.innerHTML = `
    <section class="sp-card sp-run">
      <div class="sp-bar"><span id="prog">1/${n}</span><span class="sp-clock" id="clock">0.0s</span></div>
      <div class="sp-progressbar"><div id="fill"></div></div>
      <div class="sp-q" id="q"></div>
      <input class="sp-input" id="ans" inputmode="numeric" autocomplete="off" placeholder="answer">
      <div class="sp-hint">type the answer, press <kbd>Enter</kbd> — wrong answers don't advance</div>
      <div class="sp-row">
        <button class="btn" id="skip" title="counts as wrong">skip ▸</button>
        <button class="btn sp-quit" id="quit">quit</button>
      </div>
    </section>`;
  const clock = makeClock(document.getElementById("clock"));
  const qEl = document.getElementById("q"), input = document.getElementById("ans");
  const prog = document.getElementById("prog"), fill = document.getElementById("fill");
  document.getElementById("quit").onclick = () => { clock.stop(); setup(); };
  document.getElementById("skip").onclick = () => {   // stuck ≠ run over: skip counts as wrong
    i++;
    if (i >= n) { const t = clock.stop(); return arithResults(diff, n, correct, t); }
    show();
  };

  const show = () => {
    qEl.textContent = qs[i].text;
    prog.textContent = `${i + 1}/${n}`;
    fill.style.width = (i / n * 100) + "%";
    input.value = ""; input.focus();
  };
  input.addEventListener("input", () => {
    const v = input.value.trim();
    if (v === "" || v === "-") return;
    if (Number(v) === qs[i].ans) {
      correct++; i++;
      if (i >= n) { const t = clock.stop(); return arithResults(diff, n, correct, t); }
      input.classList.remove("bad"); show();
    }
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && Number(input.value.trim()) !== qs[i].ans) {
      input.classList.add("bad");
      setTimeout(() => input.classList.remove("bad"), 300);
    }
  });
  show();
}

function arithResults(diff, n, correct, t) {
  const perQ = (t / n).toFixed(2);
  const key = "arith";
  const prev = bests()[key];
  const isBest = !prev || t < prev.secs;
  if (isBest) saveBest(key, { secs: t, label: `${n} in ${t.toFixed(1)}s (${diff})` });
  root.innerHTML = `
    <section class="sp-card sp-results">
      <div class="sp-medal">${isBest ? "🏆" : "⏱"}</div>
      <h1 class="sp-title">${t.toFixed(1)}s</h1>
      <p class="sp-sub">${n} ${diff} problems · ${perQ}s each${isBest ? " · <strong>new best!</strong>" : ""}</p>
      <div class="sp-actions">
        <button class="btn btn-check" id="again">again ▸</button>
        <button class="btn" id="home">menu</button>
      </div>
    </section>`;
  document.getElementById("again").onclick = () => runArith(diff, n);
  document.getElementById("home").onclick = setup;
}

/* ── quiz sprint ─────────────────────────────────────────────── */
function parseQuizzes(text) {
  const out = [];
  for (const sec of text.split(/^## quiz:/m).slice(1)) {
    const nl = sec.indexOf("\n");
    const title = sec.slice(0, nl).trim();
    const track = (sec.match(/^track:\s*(\S+)/m) || [])[1] || "core";
    let body = sec.slice(nl + 1).replace(/^(tags|track|source):.*$/gm, "");
    const opts = [];
    const optRe = /^- \[([ x])\] (.+)$/gm;
    let m;
    while ((m = optRe.exec(body))) opts.push({ text: m[2], right: m[1] === "x" });
    const qm = body.match(/^> (.+)$/m);
    const code = body.match(/```cpp\n([\s\S]*?)```/) || body.match(/```verilog\n([\s\S]*?)```/);
    if (opts.length >= 2 && opts.some(o => o.right))
      out.push({ title, track, opts, explain: qm ? qm[1] : "", code: code ? code[1] : null });
  }
  return out;
}

/* challenges with a harness — the raw material for interview mode */
function parseChallenges(text) {
  const out = [];
  for (const sec of text.split(/^## challenge:/m).slice(1)) {
    const nl = sec.indexOf("\n");
    const title = sec.slice(0, nl).trim();
    let body = sec.slice(nl + 1);
    const track = (body.match(/^track:\s*(\S+)/m) || [])[1] || "core";
    const lang = (body.match(/^lang:\s*(\S+)/m) || [])[1] === "python" ? "python" : "cpp";
    const difficulty = (body.match(/^difficulty:\s*(\S+)/m) || [])[1] || "";
    body = body.replace(/^(tags|track|source|difficulty|lang|hint):.*$/gm, "")
               .replace(/\n?\*\*Editorial:\*\*[\s\S]*$/m, "");
    const fence = lang === "python" ? "python" : "cpp";
    const blocks = [...body.matchAll(new RegExp("```" + fence + "\\n([\\s\\S]*?)```", "g"))].map(m => m[1]);
    const starter = blocks.find(b => /^\s*(\/\/|#)\s*starter\b/.test(b));
    const harness = blocks.find(b => /^\s*(\/\/|#)\s*harness\b/.test(b));
    const statement = body.split("```")[0].trim();
    if (!harness) continue;
    out.push({
      title, track, lang, difficulty, statement,
      starter: starter ? starter.replace(/^\s*(\/\/|#)\s*starter[^\n]*\n/, "") : "",
      harness: harness.replace(/^\s*(\/\/|#)\s*harness[^\n]*\n/, ""),
    });
  }
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function runQuiz(track, n) {
  root.innerHTML = `<section class="sp-card"><p class="sp-sub">loading ${esc(track)} questions<span class="dots"></span></p></section>`;
  const all = await loadQuizzes();
  const match = TRACK_MATCH[track] || (() => true);
  let pool = all.filter(match);
  if (!pool.length) {
    root.innerHTML = `<section class="sp-card"><p class="sp-sub">no questions found for ${esc(track)} — content may still be deploying.</p>
      <button class="btn" id="home">menu</button></section>`;
    document.getElementById("home").onclick = setup; return;
  }
  const qs = shuffle(pool).slice(0, Math.min(n, pool.length));
  let i = 0, correct = 0;
  const clockHolder = { t: 0 };

  const render = () => {
    const q = qs[i];
    root.innerHTML = `
      <section class="sp-card sp-run">
        <div class="sp-bar"><span id="prog">${i + 1}/${qs.length}</span><span class="sp-clock" id="clock">${clockHolder.t.toFixed(1)}s</span></div>
        <div class="sp-progressbar"><div id="fill" style="width:${i / qs.length * 100}%"></div></div>
        <h2 class="sp-qtitle">${inline(q.title)}</h2>
        ${q.code ? codeBlock(q.code) : ""}
        <div class="sp-options" id="opts"></div>
        <div class="sp-explain" id="explain" hidden></div>
        <button class="btn sp-quit" id="quit">quit</button>
      </section>`;
    document.getElementById("clock").textContent = clockHolder.t.toFixed(1) + "s";
    resumeClock();
    document.getElementById("quit").onclick = () => { clock.stop(); setup(); };
    const box = document.getElementById("opts");
    q.opts.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "sp-answer";
      btn.innerHTML = inline(opt.text);
      btn.onclick = () => {
        box.querySelectorAll(".sp-answer").forEach((b, k) => {
          b.disabled = true;
          if (q.opts[k].right) b.classList.add("right");
        });
        if (!opt.right) btn.classList.add("wrong"); else correct++;
        if (q.explain) {
          const ex = document.getElementById("explain");
          ex.hidden = false; ex.innerHTML = inline(q.explain);
        }
        const next = document.createElement("button");
        next.className = "btn btn-check sp-next";
        next.textContent = i + 1 >= qs.length ? "results ▸" : "next ▸";
        next.onclick = () => { i++; i >= qs.length ? finish() : render(); };
        box.after(next);
        next.focus();
      };
      box.appendChild(btn);
    });
  };

  // one continuous clock across questions
  let t0 = performance.now(), iv = null, clock;
  function resumeClock() {
    const el = () => document.getElementById("clock");
    clearInterval(iv);
    iv = setInterval(() => {
      clockHolder.t = (performance.now() - t0) / 1000;
      const e = el(); if (e) e.textContent = clockHolder.t.toFixed(1) + "s";
    }, 100);
  }
  clock = { stop: () => { clearInterval(iv); clockHolder.t = (performance.now() - t0) / 1000; return clockHolder.t; } };

  function finish() {
    const t = clock.stop();
    const key = "quiz:" + track;
    const prev = bests()[key];
    const score = correct / qs.length;
    const isBest = !prev || score > prev.score || (score === prev.score && t < prev.secs);
    if (isBest) saveBest(key, { score, secs: t, label: `${correct}/${qs.length} in ${t.toFixed(0)}s` });
    root.innerHTML = `
      <section class="sp-card sp-results">
        <div class="sp-medal">${score === 1 ? "🏆" : score >= 0.7 ? "✅" : "📚"}</div>
        <h1 class="sp-title">${correct}/${qs.length}</h1>
        <p class="sp-sub">${esc(track)} · ${t.toFixed(1)}s · ${Math.round(score * 100)}%${isBest ? " · <strong>new best!</strong>" : ""}</p>
        <div class="sp-actions">
          <button class="btn btn-check" id="again">again ▸</button>
          <button class="btn" id="home">menu</button>
        </div>
      </section>`;
    document.getElementById("again").onclick = () => runQuiz(track, n);
    document.getElementById("home").onclick = setup;
  }

  render();
}

/* ── mock interview: 3 problems vs a countdown, compile-verified ─ */

const IV_POOLS = {
  cpp: c => c.lang === "cpp" && ["core", "faang", "design"].includes(c.track),
  python: c => c.lang === "python",
  hft: c => c.track === "hft",
};

async function runInterview(pool, mins) {
  root.innerHTML = `<section class="sp-card"><p class="sp-sub">picking problems…</p></section>`;
  const all = (await loadContent()).challenges.filter(IV_POOLS[pool] || (() => true));
  const pick = d => shuffle(all.filter(c => c.difficulty === d))[0];
  const probs = [pick("easy"), pick("medium"), pick("hard")].filter(Boolean);
  while (probs.length < 3 && all.length > probs.length) {
    const extra = shuffle(all).find(c => !probs.includes(c));
    if (!extra) break; probs.push(extra);
  }
  if (!probs.length) { root.innerHTML = `<section class="sp-card"><p class="sp-sub">no problems available — check your connection</p></section>`; return setTimeout(setup, 1500); }

  const deadline = performance.now() + mins * 60_000;
  let i = 0, solved = 0, over = false;
  const results = [];

  const finish = () => {
    over = true;
    clearInterval(clockTick);
    const spent = Math.min(mins * 60_000, performance.now() - t0) / 1000;
    const label = `${solved}/${probs.length} in ${Math.floor(spent / 60)}m${Math.round(spent % 60)}s`;
    const prev = bests().interview;
    if (!prev || solved > prev.solved) saveBest("interview", { solved, label });
    root.innerHTML = `
      <section class="sp-card">
        <h1 class="sp-title">${solved === probs.length ? "hired ✓" : "time"}</h1>
        <p class="sp-sub">${label} — ${pool} interview</p>
        <ul class="sp-summary">${results.map(r =>
          `<li>${r.ok ? "✓" : "✗"} ${esc(r.title)} <span>(${esc(r.difficulty)})${r.ok ? " · " + r.secs + "s" : ""}</span></li>`).join("")}</ul>
        <div class="sp-row">
          <button class="btn btn-check" id="again">again ▸</button>
          <button class="btn" id="home">back</button>
        </div>
      </section>`;
    document.getElementById("again").onclick = () => runInterview(pool, mins);
    document.getElementById("home").onclick = setup;
  };

  const t0 = performance.now();
  let clockTick = null;

  const show = () => {
    if (i >= probs.length) return finish();
    const c = probs[i];
    const pStart = performance.now();
    root.innerHTML = `
      <section class="sp-card sp-run sp-iv">
        <div class="sp-bar">
          <span id="prog">problem ${i + 1}/${probs.length} · ${esc(c.difficulty)}</span>
          <span class="sp-clock" id="clock"></span>
        </div>
        <h2 class="sp-iv-title">${esc(c.title)}</h2>
        <div class="sp-iv-statement">${inline(esc(c.statement)).replace(/\n\n/g, "<br><br>")}</div>
        <textarea class="editor sp-iv-editor" id="code" spellcheck="false" autocapitalize="none" autocorrect="off" autocomplete="off"></textarea>
        <div class="sp-row">
          <button class="btn btn-check" id="run">run ▸</button>
          <span class="verdict" id="verdict" aria-live="polite"></span>
          <button class="btn" id="skipIv" title="counts as unsolved">skip ▸</button>
          <button class="btn sp-quit" id="quitIv">end interview</button>
        </div>
        <pre class="compile-out" id="out" hidden aria-live="polite"></pre>
      </section>`;
    const code = document.getElementById("code");
    code.value = c.starter || "";
    const verdict = document.getElementById("verdict"), out = document.getElementById("out");

    clearInterval(clockTick);
    clockTick = setInterval(() => {
      const left = Math.max(0, deadline - performance.now());
      const m = Math.floor(left / 60_000), s = Math.floor(left / 1000) % 60;
      const el = document.getElementById("clock");
      if (el) { el.textContent = `${m}:${String(s).padStart(2, "0")}`; el.classList.toggle("sp-clock-low", left < 5 * 60_000); }
      if (left <= 0 && !over) finish();
    }, 250);

    document.getElementById("quitIv").onclick = finish;
    document.getElementById("skipIv").onclick = () => {
      results.push({ title: c.title, difficulty: c.difficulty, ok: false });
      i++; show();
    };
    document.getElementById("run").onclick = async () => {
      verdict.textContent = c.lang === "python" ? "⧗ running…" : "⧗ compiling…";
      verdict.className = "verdict";
      const marker = c.lang === "python" ? "#__USER__" : "//__USER__";
      let res = null;
      try {
        const r = await fetch("https://cpp-dojo.vlad-cioaba.workers.dev/api/run", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: c.harness.replace(marker, () => code.value), lang: c.lang }),
        });
        if (r.ok) res = await r.json();
      } catch { /* offline */ }
      if (!res) { verdict.textContent = "backend unreachable"; verdict.className = "verdict no"; return; }
      out.hidden = false;
      if (!res.compile.ok) {
        out.textContent = res.compile.stderr.trim();
        verdict.textContent = "✗ compile error"; verdict.className = "verdict no";
      } else if (res.run.exit === 0 && /\bPASS\b/.test(res.run.stdout)) {
        const secs = Math.round((performance.now() - pStart) / 1000);
        results.push({ title: c.title, difficulty: c.difficulty, ok: true, secs });
        solved++; i++;
        show();
      } else {
        out.textContent = (res.run.stdout + "\n" + res.run.stderr).trim() + `\n[exit ${res.run.exit}]`;
        verdict.textContent = "✗ tests fail"; verdict.className = "verdict no";
      }
    };
  };
  show();
}

setup();
