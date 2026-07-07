/* lab: market-maker P&L — quote a two-sided market around your fair estimate
   and live through the three forces that decide whether you make money:
     · spread capture   — uninformed flow crosses your quote, you keep the edge
     · adverse selection — informed flow trades right before the mid moves against you
     · inventory risk    — the position you accumulate is marked to market as mid drifts
   Each tick is one player step: the mid random-walks, a marketable order arrives
   (some fraction informed → correlated with the move), it may cross your quote and
   fill at bid/ask, then everything is marked to market. Optional inventory skew
   leans your quotes against the position you are holding. All state lives in a JS
   shadow; run() closures compute the tick, mutate the shadow, and redraw the SVG.
   Math.random drives it — this runs in the browser, so it is intentionally
   non-deterministic (the accounting invariant, not the path, is what holds). */

LabsCore.register({
  id: "marketmaker",
  title: "market maker",
  file: "mm.hpp",
  cpp: `struct MarketMaker {
    double fair;          // our estimate of fair value (tracks the mid)
    double inventory = 0; // net position, signed (+long / -short)
    double cash      = 0;  // realised cash from fills
    double half, skewK;   // half-spread, inventory-skew gain

    // quote around a reservation price that leans against inventory
    Quote quote() const {
        double center = fair - skewK * inventory;   // skew when holding risk
        return { center - half, center + half };     // { bid, ask }
    }

    // a marketable order crossed our quote -> we take the other side
    void on_fill(bool taker_buys, double px, double qty) {
        if (taker_buys) { inventory -= qty; cash += px * qty; } // we SELL @ ask
        else            { inventory += qty; cash -= px * qty; } // we BUY  @ bid
    }

    // mark-to-market: realised cash + open inventory valued at the mid
    double pnl(double mid) const { return cash + inventory * mid; }
};`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;

    /* ── tunables (the little market this MM lives inside) ─────── */
    const N = 40;           // visible ticks
    const P_INF = 0.35;     // fraction of flow that is informed
    const VOL = 0.28;       // uninformed random-walk step scale
    const INF_MIN = 0.45, INF_MAX = 1.15;   // informed adverse-move size
    const REACH = 1.5;      // how far past mid an uninformed taker will chase
    const SKEW_K = 0.045;   // reservation-price shift per unit inventory

    /* ── geometry ─────────────────────────────────────────────── */
    const W = 600;
    const PRICE_TOP = 36, PC_H = 176, PRICE_BOT = PRICE_TOP + PC_H;
    const GAP = 48;
    const PNL_TOP = PRICE_BOT + GAP, PN_H = 118, PNL_BOT = PNL_TOP + PN_H;
    const TOTAL_H = PNL_BOT + 34;

    /* ── svg ──────────────────────────────────────────────────── */
    const svg = svgEl("svg", {}, stage);
    const gCharts = svgEl("g", {}, svg);   // fully rebuilt each tick

    /* ── shadow state (the whole sim) ─────────────────────────── */
    let mid, inventory, cash, pnl, tickCount, informedCount;
    let hist = [];   // per-tick: { fairPre, mid, bid, ask, pnl, fill, tick, informed }

    const stats = LabsCore.note("");

    /* ── controls (read live each tick) ───────────────────────── */
    const halfIn = LabsCore.numInput("½-spread", 0.5);
    const sizeIn = LabsCore.numInput("size", 10);
    let skewOn = false;
    const curHalf = () => {
      const v = Number(halfIn.value);
      return v > 0 ? v : 0.5;
    };
    const curSize = () => {
      const v = Number(sizeIn.value);
      return v > 0 ? v : 10;
    };

    /* ── the accounting core (shared by the sim and the debug handle) ─
       taker_buys => a buyer lifted our ask => we SELL; else we BUY. */
    function onFill(takerBuys, px, qty) {
      if (takerBuys) { inventory -= qty; cash += px * qty; }
      else           { inventory += qty; cash -= px * qty; }
    }

    /* ── one tick: mutate shadow, return caption + code line ───── */
    function advanceTick() {
      const hs = curHalf(), sz = curSize();
      const fairPre = mid;                                   // our fair == last mid
      const skewAdj = skewOn ? SKEW_K * inventory : 0;       // lean against inventory
      const center = fairPre - skewAdj;                      // reservation price
      const bid = center - hs, ask = center + hs;

      // decide the incoming flow
      const informed = Math.random() < P_INF;
      let dMid, side, crosses;
      if (informed) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const mag = INF_MIN + Math.random() * (INF_MAX - INF_MIN);
        dMid = dir * mag;                                    // the move they front-run
        side = dir > 0 ? "buy" : "sell";                     // trade toward the move
        crosses = true;                                      // informed takers are aggressive
      } else {
        dMid = (Math.random() * 2 - 1) * VOL;                // uncorrelated wiggle
        side = Math.random() < 0.5 ? "buy" : "sell";
        const reach = Math.random() * REACH;                 // liquidity-demand appetite
        const dist = side === "buy" ? ask - fairPre : fairPre - bid;
        crosses = dist <= reach;                             // tighter quote => more fills
      }

      // execute the fill at our quote (if the order crossed)
      let fill = null;
      if (crosses) {
        if (side === "buy") { onFill(true, ask, sz); fill = { side: "sell", px: ask }; }
        else                { onFill(false, bid, sz); fill = { side: "buy", px: bid }; }
      }

      // the mid moves, then we mark to market
      mid = fairPre + dMid;
      pnl = cash + inventory * mid;
      tickCount++;
      if (informed) informedCount++;
      hist.push({ fairPre, mid, bid, ask, pnl, fill, tick: tickCount, informed });

      // ── narrate ──
      const kind = informed ? "informed" : "uninformed";
      const move = `mid ${dMid >= 0 ? "+" : ""}${dMid.toFixed(2)} → ${mid.toFixed(2)}`;
      const mtm = inventory * dMid;                          // change in mark from the move
      let captionHtml, line;
      if (!fill) {
        const q = side === "buy" ? `ask ${ask.toFixed(2)}` : `bid ${bid.toFixed(2)}`;
        captionHtml = `no fill · ${kind} ${side} taker didn't reach your ${q} ` +
          `(spread ${(2 * hs).toFixed(2)} too wide) · ${move} · P&amp;L ${pnl.toFixed(2)}`;
        line = 8;
      } else {
        const edge = fill.side === "sell" ? (ask - fairPre) * sz : (fairPre - bid) * sz;
        const verb = fill.side === "sell"
          ? `sell ${sz} @ ask ${ask.toFixed(2)}`
          : `buy ${sz} @ bid ${bid.toFixed(2)}`;
        captionHtml = `<strong>${verb}</strong> · ${kind} · +spread ${edge.toFixed(1)} · ` +
          `${move} · mark ${mtm >= 0 ? "+" : ""}${mtm.toFixed(2)} ` +
          `(inv ${inventory >= 0 ? "+" : ""}${inventory})`;
        if (informed && mtm < 0) captionHtml += ` — <strong>adverse selection</strong>`;
        line = fill.side === "sell" ? 15 : 16;
      }
      return { captionHtml, line };
    }

    /* ── drawing (rebuild both charts from the visible window) ──── */
    const xAt = i => (N <= 1 ? 0 : (i / (N - 1)) * W);

    function lbl(text, x, y, opts = {}) {
      const t = svgEl("text", {
        class: "svg-label" + (opts.strong ? " strong" : ""),
        x, y,
        "font-size": opts.size || 11,
        "text-anchor": opts.anchor || "start",
      }, gCharts);
      if (opts.fill) t.style.fill = opts.fill;
      t.textContent = text;
      return t;
    }
    function polyline(win, key, yfn, stroke, width, dash) {
      if (win.length < 2) return;
      const pts = win.map((p, i) => `${xAt(i).toFixed(1)},${yfn(p[key]).toFixed(1)}`).join(" ");
      const el = svgEl("polyline", { points: pts, fill: "none" }, gCharts);
      el.style.stroke = stroke;
      el.style.strokeWidth = width;
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("stroke-linecap", "round");
      if (dash) el.style.strokeDasharray = dash;
    }

    function draw() {
      gCharts.innerHTML = "";
      const win = hist.slice(Math.max(0, hist.length - N));

      // frames
      const frame = (y, h) => {
        const r = svgEl("rect", { x: 0, y, width: W, height: h, rx: 8 }, gCharts);
        r.style.fill = "color-mix(in srgb, var(--panel-2) 60%, transparent)";
        r.style.stroke = "var(--border)";
        r.style.strokeWidth = 1;
      };
      frame(PRICE_TOP, PC_H);
      frame(PNL_TOP, PN_H);

      // ── price chart scale ──
      let lo = Infinity, hi = -Infinity;
      win.forEach(p => {
        lo = Math.min(lo, p.mid, p.bid, p.ask);
        hi = Math.max(hi, p.mid, p.bid, p.ask);
      });
      if (!isFinite(lo)) { lo = (mid || 100) - 2; hi = (mid || 100) + 2; }
      let r = hi - lo || 1; lo -= r * 0.14; hi += r * 0.14;
      const yP = v => PRICE_TOP + PC_H - ((v - lo) / (hi - lo)) * PC_H;

      // quote band (bid…ask) then bid / ask edges, then the mid, then fills
      if (win.length >= 2) {
        const top = win.map((p, i) => `${xAt(i).toFixed(1)},${yP(p.ask).toFixed(1)}`);
        const bot = win.map((p, i) => `${xAt(i).toFixed(1)},${yP(p.bid).toFixed(1)}`).reverse();
        const band = svgEl("polygon", { points: [...top, ...bot].join(" ") }, gCharts);
        band.style.fill = "color-mix(in srgb, var(--amber) 8%, transparent)";
        band.style.stroke = "none";
      }
      polyline(win, "ask", yP, "color-mix(in srgb, var(--red) 55%, var(--border-hi))", 1.2);
      polyline(win, "bid", yP, "color-mix(in srgb, var(--lime) 55%, var(--border-hi))", 1.2);
      polyline(win, "mid", yP, "var(--amber)", 2.1);

      // fill markers: green = you bought (hit bid), red = you sold (lifted ask)
      win.forEach((p, i) => {
        if (!p.fill) return;
        const c = p.fill.side === "sell" ? "var(--red)" : "var(--lime)";
        const dot = svgEl("circle", {
          cx: xAt(i).toFixed(1), cy: yP(p.fill.px).toFixed(1), r: 3.4,
        }, gCharts);
        dot.style.fill = c;
        dot.style.stroke = "var(--panel)";
        dot.style.strokeWidth = 1;
      });

      // ── pnl chart scale (always include 0) ──
      let plo = 0, phi = 0;
      win.forEach(p => { plo = Math.min(plo, p.pnl); phi = Math.max(phi, p.pnl); });
      let pr = phi - plo || 1; plo -= pr * 0.16; phi += pr * 0.16;
      const yPnl = v => PNL_TOP + PN_H - ((v - plo) / (phi - plo)) * PN_H;

      // zero baseline
      if (plo <= 0 && phi >= 0) {
        const z = svgEl("line", {
          x1: 0, y1: yPnl(0).toFixed(1), x2: W, y2: yPnl(0).toFixed(1),
        }, gCharts);
        z.style.stroke = "var(--border-hi)";
        z.style.strokeWidth = 1;
        z.style.strokeDasharray = "4 4";
      }
      if (win.length >= 2) {
        const base = yPnl(Math.max(plo, Math.min(0, phi))).toFixed(1);
        const top = win.map((p, i) => `${xAt(i).toFixed(1)},${yPnl(p.pnl).toFixed(1)}`);
        const area = svgEl("polygon", {
          points: [`${xAt(0).toFixed(1)},${base}`, ...top,
                   `${xAt(win.length - 1).toFixed(1)},${base}`].join(" "),
        }, gCharts);
        const last = win[win.length - 1].pnl;
        area.style.fill = `color-mix(in srgb, ${last >= 0 ? "var(--lime)" : "var(--red)"} 13%, transparent)`;
        area.style.stroke = "none";
      }
      polyline(win, "pnl", yPnl, "var(--teal)", 2);

      // ── labels ──
      const cur = win[win.length - 1];
      lbl("PRICE — mid (amber) · your bid/ask band", 6, PRICE_TOP - 8, {
        strong: true, fill: "var(--muted)",
      });
      if (cur) {
        lbl(`mid ${cur.mid.toFixed(2)}   bid ${cur.bid.toFixed(2)}   ask ${cur.ask.toFixed(2)}`,
          W - 6, PRICE_TOP - 8, { anchor: "end", fill: "var(--amber)" });
      }
      lbl("P&L — mark-to-market (cash + inventory × mid)", 6, PNL_TOP - 8, {
        strong: true, fill: "var(--muted)",
      });
      lbl(`P&L ${pnl.toFixed(2)}`, W - 6, PNL_TOP - 8, {
        anchor: "end", fill: pnl >= 0 ? "var(--lime)" : "var(--red)",
      });
      lbl("green ● you bought (hit your bid)   red ● you sold (lifted your ask)",
        6, PNL_BOT + 22, { size: 10, fill: "var(--faint)" });

      const { capped } = fitStage(svg, stage, W, TOTAL_H, 0.5);
      const invStr = `${inventory >= 0 ? "+" : ""}${inventory}`;
      stats.textContent =
        `tick ${tickCount} · inv ${invStr} · cash ${cash.toFixed(1)} · ` +
        `P&L ${pnl.toFixed(2)} · informed ${informedCount}/${tickCount} · ` +
        `spread ${(2 * curHalf()).toFixed(2)} · skew ${skewOn ? "on" : "off"}` +
        (capped ? "  ·  zoom capped, scroll →" : "");
    }

    /* ── a tick as a player step (lazy: run() computes + draws) ── */
    function tickStep() {
      return {
        run: () => {
          const { captionHtml, line } = advanceTick();
          draw();
          player.caption(captionHtml);
          player.highlightLine(line);
        },
      };
    }

    /* ── reset ────────────────────────────────────────────────── */
    function reset() {
      mid = 100; inventory = 0; cash = 0; pnl = 0;
      tickCount = 0; informedCount = 0;
      hist = [];
      draw();
      player.caption(
        "quote a two-sided market — earn the <strong>spread</strong> on uninformed flow, " +
        "bleed to <strong>informed</strong> flow + <strong>inventory</strong> drift");
    }

    /* ── controls ─────────────────────────────────────────────── */
    const skewBtn = LabsCore.button("skew: off", () => {
      skewOn = !skewOn;
      skewBtn.textContent = "skew: " + (skewOn ? "on" : "off");
      skewBtn.classList.toggle("playing", skewOn);
      draw();
    });

    controls.append(
      halfIn, sizeIn,
      LabsCore.button("tick ▸", () => player.enqueue([tickStep()])),
      LabsCore.button("run ×20", () => {
        const steps = [];
        for (let i = 0; i < 20; i++) steps.push(tickStep());
        player.enqueue(steps);
      }),
      skewBtn,
      LabsCore.button("reset", () => { player.clear(); reset(); }),
      stats,
    );

    player.onReset(reset);
    reset();
    sizeIn.addEventListener("keydown", e => {
      if (e.key === "Enter") player.enqueue([tickStep()]);
    });

    /* ── debug handle: headless accounting-invariant tests ─────── */
    window.__mm = {
      get state() {
        const hs = curHalf();
        const center = mid - (skewOn ? SKEW_K * inventory : 0);
        return {
          mid, fair: mid, bid: center - hs, ask: center + hs,
          inventory, cash, pnl: cash + inventory * mid, pnlStored: pnl,
          tick: tickCount, informed: informedCount, half: hs, size: curSize(),
        };
      },
      // exercise the REAL accounting path used by the sim
      onFill(takerBuys, px, qty) { onFill(takerBuys, px, qty); pnl = cash + inventory * mid; return this.state; },
      pnl() { return cash + inventory * mid; },
      tick() { const s = tickStep(); s.run(); return this.state; },
      reset() { reset(); },
    };
  },
});
