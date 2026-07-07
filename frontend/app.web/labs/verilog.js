/* lab: sequential logic — step a clock, watch registers update on the edge.
   Draws a classic digital timing diagram (waveforms). Non-blocking `<=`
   means every RHS samples the OLD state at once — see the shift register. */

LabsCore.register({
  id: "verilog",
  title: "verilog",
  file: "seq.v",
  cpp: `// seq.v — sequential logic. Registers update only on the clock edge.
// Non-blocking <= : every right-hand side reads the OLD state, together.

module dff (input clk, input d, output reg q);
    always @(posedge clk)
        q <= d;                    // q takes d, one cycle later
endmodule

module tff (input clk, output reg q);
    always @(posedge clk)
        q <= ~q;                   // toggle: q divides clk by 2
endmodule

module counter4 (input clk, output reg [3:0] count);
    always @(posedge clk)
        count <= count + 1;        // 4-bit, wraps 15 -> 0
endmodule

module shift4 (input clk, input serial_in, output reg [3:0] q);
    always @(posedge clk)
        q <= {q[2:0], serial_in};  // q3<=q2, q2<=q1, q1<=q0, q0<=in
endmodule`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;

    /* ── geometry ───────────────────────────────────────────── */
    const LABEL_W = 60, CYCLE_W = 58, TOP = 24, LANE_H = 48, SWING = 24, BPAD = 12;

    const bit = (n, k) => (n >> k) & 1;
    const bits4 = n => (n & 15).toString(2).padStart(4, "0");

    /* ── circuit definitions ───────────────────────────────────
       next(state, input) is the posedge next-state. lanes describe the
       waveform rows; each lane pulls its per-cycle value from a frame. */
    const CIRCUITS = {
      dff: {
        name: "D flip-flop", module: 4, assign: 6,
        hasInput: true, inputName: "d", stateInit: 0,
        next: (st, inp) => inp,
        lanes: [
          { label: "clk", type: "clk" },
          { label: "d", type: "bit", io: "in", val: f => f.in },
          { label: "q", type: "bit", io: "out", val: f => f.st & 1 },
        ],
        fmt: st => `q=${st}`,
        intro: "D flip-flop: on each <strong>posedge clk</strong>, <strong>q &lt;= d</strong>. Toggle d, then clock — q copies d, delayed one cycle.",
        cap: (prev, ns) => `posedge clk · <strong>q &lt;= d</strong> — samples d=${prev.in}, so q becomes <strong>${ns}</strong> (one-cycle delay)`,
      },
      tff: {
        name: "toggle (T-FF)", module: 9, assign: 11,
        hasInput: false, stateInit: 0,
        next: (st) => st ^ 1,
        lanes: [
          { label: "clk", type: "clk" },
          { label: "q", type: "bit", io: "out", val: f => f.st & 1 },
        ],
        fmt: st => `q=${st}`,
        intro: "Toggle flip-flop: <strong>q &lt;= ~q</strong> every posedge — q divides the clock by two. Clock it and watch q flip.",
        cap: (prev, ns) => `posedge clk · <strong>q &lt;= ~q</strong> — toggle ${prev.st} → <strong>${ns}</strong>`,
      },
      counter4: {
        name: "4-bit counter", module: 14, assign: 16,
        hasInput: false, stateInit: 0,
        next: (st) => (st + 1) & 15,
        lanes: [
          { label: "clk", type: "clk" },
          { label: "count", type: "bus", val: f => f.st },
        ],
        fmt: st => `count=${st} (${bits4(st)})`,
        intro: "4-bit counter: <strong>count &lt;= count + 1</strong> each posedge, wrapping 15 → 0. Clock it and read the bus.",
        cap: (prev, ns) => `posedge clk · <strong>count &lt;= count + 1</strong> — ${prev.st} → <strong>${ns}</strong>${prev.st === 15 ? " (wraps mod 16)" : ""}`,
      },
      shift4: {
        name: "shift register (4-bit)", module: 19, assign: 21,
        hasInput: true, inputName: "serial_in", stateInit: 0,
        next: (st, inp) => ((st << 1) | inp) & 15,
        lanes: [
          { label: "clk", type: "clk" },
          { label: "serial_in", type: "bit", io: "in", val: f => f.in },
          { label: "q3", type: "bit", io: "out", val: f => bit(f.st, 3) },
          { label: "q2", type: "bit", io: "out", val: f => bit(f.st, 2) },
          { label: "q1", type: "bit", io: "out", val: f => bit(f.st, 1) },
          { label: "q0", type: "bit", io: "out", val: f => bit(f.st, 0) },
        ],
        fmt: st => `q=${bits4(st)}`,
        intro: "4-bit shift register: <strong>q &lt;= {q[2:0], serial_in}</strong>. Non-blocking means every bit samples the OLD state at once. Set serial_in, then clock.",
        cap: (prev, ns) => `posedge clk · <strong>q &lt;= {q[2:0], serial_in}</strong> — non-blocking: all bits sample OLD state at once. ${bits4(prev.st)} shifts to <strong>${bits4(ns)}</strong>, serial_in=${prev.in} enters q0`,
      },
    };

    /* ── svg + state ───────────────────────────────────────────
       frames[] is the eager shadow (the truth). The rightmost frame is the
       live cycle whose input the user edits. Each clock appends a frame.
       drawn = index of newest revealed cycle; render() reads the shadow and
       only mutates the SVG. */
    const svg = svgEl("svg", {}, stage);
    const gWave = svgEl("g", {}, svg);

    let curId = "dff", C = CIRCUITS.dff;
    let frames = [{ in: 0, st: 0 }];
    let drawn = 0;

    const curFrame = () => frames[frames.length - 1];

    /* ── controls ──────────────────────────────────────────── */
    const stateNote = LabsCore.note("");
    let inputBtn = null;
    let circBtns = {};

    function updateInputBtn() {
      if (inputBtn) inputBtn.textContent = `${C.inputName} = ${curFrame().in}`;
    }

    function buildControls() {
      controls.innerHTML = "";
      circBtns = {};
      for (const id of Object.keys(CIRCUITS)) {
        const b = LabsCore.button(CIRCUITS[id].name, () => selectCircuit(id));
        if (id === curId) { b.style.borderColor = "var(--lime)"; b.style.color = "var(--lime)"; }
        circBtns[id] = b;
        controls.appendChild(b);
      }
      inputBtn = null;
      if (C.hasInput) {
        inputBtn = LabsCore.button("", () => {
          const f = curFrame();
          f.in = f.in ? 0 : 1;
          updateInputBtn();
          render();
        });
        controls.appendChild(inputBtn);
        updateInputBtn();
      }
      controls.append(
        LabsCore.button("clock ▸", () => doClock(1)),
        LabsCore.button("run ×8", () => doClock(8)),
        LabsCore.button("reset", () => { player.clear(); resetState(); }),
        stateNote,
      );
    }

    /* ── clock stepping (eager shadow, run() only draws) ─────── */
    function clockSteps(n) {
      const steps = [];
      for (let k = 0; k < n; k++) {
        const prev = curFrame();
        const ns = C.next(prev.st, prev.in);
        frames.push({ in: prev.in, st: ns });     // new live cycle
        const idx = frames.length - 1;
        steps.push({
          line: C.assign,
          caption: C.cap(prev, ns),
          run: () => { drawn = idx; render(); },
        });
      }
      return steps;
    }
    function doClock(n) { player.enqueue(clockSteps(n)); }

    /* ── drawing ──────────────────────────────────────────────
       render() rebuilds the waveform <g> from the shadow up to `drawn`. */
    function poly(points, stroke) {
      svgEl("polyline", {
        points: points.map(p => p.join(",")).join(" "),
        fill: "none", stroke, "stroke-width": 2, "stroke-linejoin": "round",
      }, gWave);
    }

    function render() {
      gWave.innerHTML = "";
      const lanes = C.lanes;
      const n = drawn + 1;                        // cycles currently visible
      const W = LABEL_W + n * CYCLE_W;
      const H = TOP + lanes.length * LANE_H + 4;

      // posedge boundaries (faint), newest posedge highlighted amber
      for (let c = 0; c <= n; c++) {
        const x = LABEL_W + c * CYCLE_W;
        svgEl("line", {
          x1: x, y1: TOP - 8, x2: x, y2: H - 4,
          stroke: "var(--border)", "stroke-width": 1,
        }, gWave);
      }
      if (n > 1) {
        const x = LABEL_W + (n - 1) * CYCLE_W;    // edge that made the newest cycle
        svgEl("line", {
          x1: x, y1: TOP - 8, x2: x, y2: H - 4,
          stroke: "color-mix(in srgb, var(--amber) 70%, transparent)", "stroke-width": 1.5,
        }, gWave);
        const tri = svgEl("polygon", {
          points: `${x - 4},${TOP - 8} ${x + 4},${TOP - 8} ${x},${TOP - 1}`,
          fill: "var(--amber)",
        }, gWave);
        tri.setAttribute("opacity", "0.9");
      }

      // cycle numbers along the top
      for (let c = 0; c < n; c++) {
        const t = svgEl("text", {
          x: LABEL_W + c * CYCLE_W + CYCLE_W / 2, y: 12,
          class: "svg-label", "text-anchor": "middle",
        }, gWave);
        t.textContent = c;
      }

      lanes.forEach((lane, i) => {
        const top = TOP + i * LANE_H;
        const yHigh = top + BPAD, yLow = top + BPAD + SWING;

        const lb = svgEl("text", {
          x: LABEL_W - 10, y: (yHigh + yLow) / 2 + 4,
          class: "svg-label strong", "text-anchor": "end",
        }, gWave);
        lb.textContent = lane.label;

        if (lane.type === "clk") {
          const pts = [[LABEL_W, yLow]];
          for (let c = 0; c < n; c++) {
            const x0 = LABEL_W + c * CYCLE_W;
            pts.push([x0, yHigh], [x0 + CYCLE_W / 2, yHigh], [x0 + CYCLE_W / 2, yLow], [x0 + CYCLE_W, yLow]);
          }
          poly(pts, "var(--teal)");
        } else if (lane.type === "bit") {
          const pts = [];
          for (let c = 0; c < n; c++) {
            const x0 = LABEL_W + c * CYCLE_W;
            const y = lane.val(frames[c]) ? yHigh : yLow;
            pts.push([x0, y], [x0 + CYCLE_W, y]);
          }
          poly(pts, lane.io === "in" ? "var(--blue)" : "var(--lime)");
        } else if (lane.type === "bus") {
          for (let c = 0; c < n; c++) {
            const x0 = LABEL_W + c * CYCLE_W;
            const g = svgEl("g", { class: "vcell" + (c === drawn && n > 1 ? " hot" : "") }, gWave);
            g.setAttribute("transform", `translate(${x0 + 4}, ${top + BPAD - 8})`);
            svgEl("rect", { width: CYCLE_W - 8, height: SWING + 16, rx: 6 }, g);
            const v = lane.val(frames[c]);
            const t = svgEl("text", { x: (CYCLE_W - 8) / 2, y: (SWING + 16) / 2 + 1, "font-size": 15 }, g);
            t.textContent = v;
            const bt = svgEl("text", {
              x: LABEL_W + c * CYCLE_W + CYCLE_W / 2, y: top + BPAD + SWING + 20,
              class: "svg-label", "text-anchor": "middle",
            }, gWave);
            bt.textContent = bits4(v);
          }
        }
      });

      const fit = fitStage(svg, stage, W, H, 0.5);
      stage.scrollLeft = stage.scrollWidth;
      stateNote.textContent =
        `${C.name} · cycle ${drawn} · ${C.fmt(frames[drawn].st)}` +
        (fit.capped ? "  ·  zoom capped, scroll →" : "");
    }

    /* ── reset / select ───────────────────────────────────── */
    function resetState() {
      frames = [{ in: 0, st: C.stateInit }];
      drawn = 0;
      updateInputBtn();
      render();
      player.caption(C.intro);
      player.highlightLine(C.assign);
    }

    function selectCircuit(id) {
      player.clear();
      curId = id;
      C = CIRCUITS[id];
      buildControls();
      resetState();
    }

    player.onReset(resetState);

    /* debug handle for the smoke test (harmless in prod) */
    if (typeof window !== "undefined") {
      window.__verilogLab = {
        select: id => selectCircuit(id),
        setInput: v => { curFrame().in = v ? 1 : 0; updateInputBtn(); render(); },
        clock: (k = 1) => doClock(k),
        state: () => curFrame().st,
        cycles: () => frames.length,
        drawn: () => drawn,
        circuit: () => curId,
        polylineCount: () => svg.querySelectorAll("polyline").length,
      };
    }

    selectCircuit("dff");
  },
});
