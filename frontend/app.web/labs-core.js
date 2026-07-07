/* cpp-dojo labs — shared engine: lab registry, step player, svg helpers,
   zoom-with-cap, C++ code panel. Labs register via LabsCore.register(). */

window.LabsCore = (function () {
  const labs = [];

  function register(lab) { labs.push(lab); }

  /* ── svg helpers ───────────────────────────────────────────── */

  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(name, attrs = {}, parent) {
    const el = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  /* Zoom-out-then-cap: fit content (w×h logical units) into the stage.
     Scale shrinks as content grows, but never below minScale — after the
     cap the svg gets bigger than the stage and the stage scrolls. */
  function fitStage(svg, stage, w, h, minScale = 0.45, pad = 24) {
    const availW = stage.clientWidth - pad * 2;
    const availH = stage.clientHeight - pad * 2;
    let scale = Math.min(availW / w, availH / h, 1);
    const capped = scale < minScale;
    if (capped) scale = minScale;
    svg.setAttribute("viewBox", `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
    svg.setAttribute("width", (w + pad * 2) * scale);
    svg.setAttribute("height", (h + pad * 2) * scale);
    return { scale, capped };
  }

  /* ── step player ───────────────────────────────────────────── */
  /* Steps: {run: fn, caption?: string(html), line?: codeLine}. Player owns
     the transport buttons; labs just push steps via player.enqueue(). */

  function makePlayer(ui) {
    let queue = [];
    let timer = null;
    let playing = false;
    let resetFn = null;

    function setPlaying(on) {
      playing = on;
      ui.play.textContent = on ? "❚❚" : "▶";
      ui.play.classList.toggle("playing", on);
      if (!on && timer) { clearTimeout(timer); timer = null; }
      if (on) tick();
    }

    function tick() {
      if (!playing) return;
      if (!step()) { setPlaying(false); return; }
      timer = setTimeout(tick, Number(ui.speed.value));
    }

    function step() {
      const s = queue.shift();
      if (!s) return false;
      try { s.run(); } catch (e) { console.error("lab step error:", e); }
      if (s.caption != null) ui.caption.innerHTML = s.caption;
      if (s.line != null) highlightLine(s.line);
      return true;
    }

    function highlightLine(n) {
      document.querySelectorAll(".lab-code-body .cl.active")
        .forEach(el => el.classList.remove("active"));
      if (n > 0) {
        const el = document.querySelector(`.lab-code-body .cl[data-l="${n}"]`);
        if (el) {
          el.classList.add("active");
          el.scrollIntoView({ block: "nearest" });
        }
      }
    }

    ui.play.onclick = () => setPlaying(!playing);
    ui.step.onclick = () => { setPlaying(false); step(); };
    ui.reset.onclick = () => {
      setPlaying(false);
      queue = [];
      ui.caption.textContent = "";
      highlightLine(0);
      if (resetFn) resetFn();
    };

    return {
      enqueue(steps) {
        queue.push(...steps);
        if (!playing) setPlaying(true);   // auto-play on new work
      },
      clear() { queue = []; setPlaying(false); },
      caption(html) { ui.caption.innerHTML = html; },
      highlightLine,
      onReset(fn) { resetFn = fn; },
      get pending() { return queue.length; },
    };
  }

  /* ── boot: tabs, panels, lab switching ─────────────────────── */

  let active = null;

  function activate(lab, els, player) {
    if (active?.teardown) active.teardown();
    player.clear();
    player.onReset(null);
    els.stage.innerHTML = "";
    els.controls.innerHTML = "";
    els.caption.textContent = "";
    els.codeTab.textContent = lab.file || lab.id + ".hpp";
    els.codePanel.innerHTML = CPP.codeBlock(lab.cpp, true);
    document.querySelectorAll("#labTabs .chip")
      .forEach(c => c.classList.toggle("active", c.dataset.lab === lab.id));
    active = lab;
    lab.boot({
      stage: els.stage,
      controls: els.controls,
      player,
      svgEl, fitStage,
    });
    location.hash = lab.id;
  }

  function boot() {
    const els = {
      stage: document.getElementById("labStage"),
      controls: document.getElementById("labControls"),
      caption: document.getElementById("labCaption"),
      codeTab: document.getElementById("labCodeTab"),
      codePanel: document.getElementById("labCodePanel"),
      play: document.getElementById("pbPlay"),
      step: document.getElementById("pbStep"),
      reset: document.getElementById("pbReset"),
      speed: document.getElementById("pbSpeed"),
    };
    const player = makePlayer({
      play: els.play, step: els.step, reset: els.reset,
      speed: els.speed, caption: els.caption,
    });

    const tabs = document.getElementById("labTabs");
    for (const lab of labs) {
      const b = document.createElement("button");
      b.className = "chip";
      b.dataset.lab = lab.id;
      b.textContent = lab.title;
      b.onclick = () => activate(lab, els, player);
      tabs.appendChild(b);
    }

    const fromHash = labs.find(l => l.id === location.hash.slice(1));
    if (labs.length) activate(fromHash || labs[0], els, player);
  }

  /* toolbar helpers so labs build consistent controls */
  function button(label, onClick) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }
  function numInput(placeholder, value) {
    const i = document.createElement("input");
    i.type = "number";
    i.placeholder = placeholder;
    if (value != null) i.value = value;
    return i;
  }
  function note(text) {
    const s = document.createElement("span");
    s.className = "lab-note";
    s.textContent = text;
    return s;
  }

  return { register, boot, svgEl, fitStage, button, numInput, note };
})();
