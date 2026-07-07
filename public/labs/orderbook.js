/* lab: limit order book + matching engine — price-time priority. Resting bids
   (green) and asks (red) meet at the spread; an incoming crossing order (teal)
   matches the best opposite level, filling min(incoming, resting) FIFO, then
   the remainder rests. All fills are computed eagerly against a JS shadow book;
   run() closures only mutate the SVG. */

LabsCore.register({
  id: "orderbook",
  title: "order book",
  file: "matcher.hpp",
  cpp: `using Price = int;
struct Order { int id; int qty; };            // price-time priority: FIFO

std::map<Price, std::deque<Order>, std::greater<>> bids;  // best = highest
std::map<Price, std::deque<Order>, std::less<>>    asks;  // best = lowest

int match(bool buy, Price px, int qty) {
    auto& book = buy ? asks : bids;           // cross the opposite side
    while (qty > 0 && !book.empty()) {
        auto  it   = book.begin();            // best opposite level
        Price best = it->first;
        if (buy ? px < best : px > best) break;   // no overlap — stop
        auto&  q   = it->second;              // FIFO queue at this price
        Order& top = q.front();               // oldest order fills first
        int fill = std::min(qty, top.qty);
        qty -= fill;  top.qty -= fill;        // partial or full fill
        if (top.qty == 0) q.pop_front();      // resting order consumed
        if (q.empty())    book.erase(it);     // price level gone
    }
    return qty;                               // unfilled remainder
}

void limit(bool buy, Price px, int qty) {
    int rem = match(buy, px, qty);            // try to cross first
    if (rem > 0)                              // remainder rests, FIFO
        (buy ? bids : asks)[px].push_back({id++, rem});
}`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;

    /* ── geometry ─────────────────────────────────────────────── */
    const CELL_W = 104, INC_W = 150, CELL_H = 34, GAPX = 8, ROW_H = 46;
    const X0 = 12, SPREAD_H = 46;

    /* ── colour tints (inline style beats the .vcell rect stylesheet rule) ── */
    const TINT = {
      bid: { fill: "color-mix(in srgb, var(--lime) 20%, var(--panel-2))",
             stroke: "color-mix(in srgb, var(--lime) 60%, var(--border-hi))" },
      ask: { fill: "color-mix(in srgb, var(--red) 20%, var(--panel-2))",
             stroke: "color-mix(in srgb, var(--red) 60%, var(--border-hi))" },
      inc: { fill: "color-mix(in srgb, var(--teal) 22%, var(--panel-2))",
             stroke: "var(--teal)" },
      hot: { fill: "color-mix(in srgb, var(--amber) 30%, var(--panel-2))",
             stroke: "var(--amber)" },
    };

    /* ── svg groups ───────────────────────────────────────────── */
    const svg = svgEl("svg", {}, stage);
    const gStatic = svgEl("g", {}, svg);   // labels + spread band (redrawn)
    const gCells = svgEl("g", {}, svg);    // resting order cells (persist)
    const gInc = svgEl("g", {}, svg);      // incoming order cell

    /* ── shadow book (steps generated eagerly against this) ───────
       level = { price, orders: [ {id, qty} ] }.  bids sorted price DESC,
       asks sorted price ASC — index 0 is always the best. */
    let shadow = { bids: [], asks: [] };
    let nextId = 1;

    /* ── visual book (mirrors shadow; run() closures mutate this) ──
       level = { price, orders: [ {id, qty, g, rect, txt} ] } */
    let vis = { bids: [], asks: [] };
    const cellById = new Map();   // id -> { o, side }  (side: "bid"|"ask")
    let incoming = null;          // { g, rect, txt }

    const stats = LabsCore.note("");

    /* ── pure shadow helpers ──────────────────────────────────── */
    function sortLevels(arr, side) {
      arr.sort((a, b) => side === "ask" ? a.price - b.price : b.price - a.price);
    }
    function insertResting(side, price, qty, id) {
      const arr = side === "ask" ? shadow.asks : shadow.bids;
      let lvl = arr.find(l => l.price === price);
      if (!lvl) { lvl = { price, orders: [] }; arr.push(lvl); sortLevels(arr, side); }
      lvl.orders.push({ id, qty });
    }
    function bestMid() {
      const bb = shadow.bids[0]?.price, ba = shadow.asks[0]?.price;
      if (bb != null && ba != null) return Math.round((bb + ba) / 2);
      if (bb != null) return bb + 1;
      if (ba != null) return ba - 1;
      return 100;
    }

    /* ── visual primitives (only touch the SVG / vis mirror) ──── */
    function mkCell(parent, w, tint, label) {
      const g = svgEl("g", { class: "vcell" }, parent);
      const rect = svgEl("rect", { width: w, height: CELL_H, rx: 7 }, g);
      rect.style.fill = tint.fill;
      rect.style.stroke = tint.stroke;
      rect.style.strokeWidth = "1.4";
      const txt = svgEl("text", { x: w / 2, y: CELL_H / 2 + 4, "font-size": 12.5 }, g);
      txt.textContent = label;
      return { g, rect, txt };
    }
    function paint(rect, tint) { rect.style.fill = tint.fill; rect.style.stroke = tint.stroke; }

    function visInsert(side, price, qty, id) {
      const arr = side === "ask" ? vis.asks : vis.bids;
      let lvl = arr.find(l => l.price === price);
      if (!lvl) { lvl = { price, orders: [] }; arr.push(lvl); sortLevels(arr, side); }
      const cell = mkCell(gCells, CELL_W, TINT[side], `${qty} @ ${price}`);
      const o = { id, qty, price, ...cell };
      lvl.orders.push(o);
      cellById.set(id, { o, side });
      relayout();
    }
    function visSetQty(id, qty) {
      const e = cellById.get(id); if (!e) return;
      e.o.qty = qty;
      e.o.txt.textContent = `${qty} @ ${e.o.price}`;
    }
    function visFlash(id) {
      const e = cellById.get(id); if (!e) return;
      paint(e.o.rect, TINT.hot);
      setTimeout(() => { const c = cellById.get(id); if (c) paint(c.o.rect, TINT[c.side]); }, 380);
    }
    function visHot(id) { const e = cellById.get(id); if (e) paint(e.o.rect, TINT.hot); }
    function visRemove(id) {
      const e = cellById.get(id); if (!e) return;
      cellById.delete(id);
      const arr = e.side === "ask" ? vis.asks : vis.bids;
      const lvl = arr.find(l => l.orders.some(o => o.id === id));
      if (lvl) {
        lvl.orders = lvl.orders.filter(o => o.id !== id);
        if (lvl.orders.length === 0) arr.splice(arr.indexOf(lvl), 1);
      }
      e.o.g.classList.add("dying");
      const g = e.o.g;
      setTimeout(() => g.remove(), 380);
      relayout();
    }
    function visShowIncoming(buy, price, qty, market) {
      if (incoming) incoming.g.remove();
      const label = `${buy ? "BUY" : "SELL"} ${qty} @ ${market ? "mkt" : price}`;
      incoming = mkCell(gInc, INC_W, TINT.inc, label);
      incoming.buy = buy; incoming.price = price; incoming.market = market;
      incoming.g.setAttribute("transform", `translate(${X0}, 20)`);
    }
    function visIncomingQty(qty) {
      if (!incoming) return;
      incoming.txt.textContent =
        `${incoming.buy ? "BUY" : "SELL"} ${qty} @ ${incoming.market ? "mkt" : incoming.price}`;
      incoming.rect.style.strokeWidth = "3";
      setTimeout(() => { if (incoming) incoming.rect.style.strokeWidth = "1.4"; }, 300);
    }
    function visIncomingDone(mode) {
      if (!incoming) return;
      const inc = incoming; incoming = null;
      if (mode === "cancel") paint(inc.rect, TINT.ask);
      inc.g.classList.add("dying");
      setTimeout(() => inc.g.remove(), 380);
    }

    /* ── layout ───────────────────────────────────────────────── */
    function lbl(text, x, y, strong, fill) {
      const t = svgEl("text", { class: "svg-label" + (strong ? " strong" : ""), x, y }, gStatic);
      if (fill) t.style.fill = fill;
      t.textContent = text;
      return t;
    }
    function relayout() {
      gStatic.innerHTML = "";
      const na = vis.asks.length, nb = vis.bids.length;

      const asksHeadY = 82, asksTop = 92;
      const spreadTop = asksTop + na * ROW_H;
      const bidsHeadY = spreadTop + SPREAD_H + 16;
      const bidsTop = bidsHeadY + 10;
      const totalH = bidsTop + nb * ROW_H + 10;

      let maxN = 1;
      vis.asks.concat(vis.bids).forEach(l => { maxN = Math.max(maxN, l.orders.length); });
      const W = Math.max(X0 + maxN * (CELL_W + GAPX) + 4, 380);

      // asks: highest price on top, best (lowest) just above the spread
      vis.asks.slice().reverse().forEach((lvl, r) => {
        const y = asksTop + r * ROW_H;
        lvl.orders.forEach((o, i) =>
          o.g.setAttribute("transform", `translate(${X0 + i * (CELL_W + GAPX)}, ${y})`));
      });
      // bids: best (highest) just below the spread, descending downward
      vis.bids.forEach((lvl, r) => {
        const y = bidsTop + r * ROW_H;
        lvl.orders.forEach((o, i) =>
          o.g.setAttribute("transform", `translate(${X0 + i * (CELL_W + GAPX)}, ${y})`));
      });

      // headers
      lbl("incoming ▾", X0, 13, true, "var(--teal)");
      lbl("ASKS · sell  (lowest ask = best, nearest spread)", X0, asksHeadY, true,
        "color-mix(in srgb, var(--red) 80%, var(--ink))");
      lbl("BIDS · buy  (highest bid = best, nearest spread)", X0, bidsHeadY, true,
        "color-mix(in srgb, var(--lime) 75%, var(--ink))");

      // spread band
      const band = svgEl("rect", {
        x: -6, y: spreadTop, width: W + 12, height: SPREAD_H, rx: 8,
      }, gStatic);
      band.style.fill = "color-mix(in srgb, var(--amber) 8%, var(--panel-2))";
      band.style.stroke = "color-mix(in srgb, var(--amber) 35%, var(--border))";
      const bb = vis.bids[0]?.price, ba = vis.asks[0]?.price;
      const spreadTxt = (bb != null && ba != null)
        ? `best bid ${bb}    ·    best ask ${ba}    ·    spread ${ba - bb}`
        : bb != null ? `best bid ${bb}    ·    no asks`
          : ba != null ? `no bids    ·    best ask ${ba}`
            : "empty book — add resting orders";
      const st = svgEl("text", {
        class: "svg-label strong", x: W / 2, y: spreadTop + SPREAD_H / 2 + 4,
        "text-anchor": "middle", "font-size": 13,
      }, gStatic);
      st.style.fill = "var(--amber)";
      st.textContent = spreadTxt;

      const { capped } = fitStage(svg, stage, W, totalH, 0.5);
      stats.textContent =
        `bids ${nb} lvl · asks ${na} lvl` +
        (bb != null && ba != null ? ` · spread ${ba - bb}` : "") +
        (capped ? "  ·  zoom capped, scroll" : "");
    }

    /* ── eager step generator: match against the shadow book ────── */
    function genOrder({ buy, price, qty, market }) {
      const steps = [];
      const fills = [];
      let remaining = qty;
      const opp = buy ? shadow.asks : shadow.bids;
      const oppName = buy ? "asks" : "bids";
      const sideWord = market ? (buy ? "market buy" : "market sell") : (buy ? "buy" : "sell");
      const pxLabel = market ? "mkt" : price;

      steps.push({
        line: 8,
        caption: `<strong>${sideWord} ${qty}${market ? "" : " @ " + price}</strong> — cross the opposite side, the <strong>${oppName.toUpperCase()}</strong>`,
        run: () => visShowIncoming(buy, price, qty, market),
      });

      if (opp.length === 0) {
        steps.push({
          line: 9,
          caption: `no resting ${oppName} — nothing to cross`,
          run: () => {},
        });
      }

      while (remaining > 0 && opp.length > 0) {
        const level = opp[0];
        const best = level.price;
        const crosses = market || (buy ? price >= best : price <= best);

        steps.push({
          line: 12,
          caption: crosses
            ? (market
              ? `market — crosses best ${buy ? "ask" : "bid"} <strong>${best}</strong> unconditionally`
              : `${buy ? `${price} ≥ ${best}` : `${price} ≤ ${best}`} — <strong>crosses</strong> best ${buy ? "ask" : "bid"} ${best} ✓`)
            : `${buy ? `${price} &lt; ${best}` : `${price} &gt; ${best}`} — no overlap, <strong>stop</strong>`,
          run: () => visIncomingQty(remaining),
        });
        if (!crosses) break;

        const top = level.orders[0];
        const topId = top.id, topPrice = best, topQty0 = top.qty;
        steps.push({
          line: 14,
          caption: `best ${buy ? "ask" : "bid"} level ${topPrice}: oldest order <strong>${topQty0}</strong> fills first (FIFO)`,
          run: () => visHot(topId),
        });

        const fill = Math.min(remaining, top.qty);
        steps.push({
          line: 15,
          caption: `fill = min(incoming ${remaining}, resting ${top.qty}) = <strong>${fill}</strong> @ ${topPrice}`,
          run: () => {},
        });

        remaining -= fill;
        top.qty -= fill;
        fills.push({ price: topPrice, qty: fill });
        const full = top.qty === 0;
        const restRem = top.qty, incRem = remaining;
        steps.push({
          line: 16,
          caption: full
            ? `filled <strong>${fill}@${topPrice}</strong> — resting order emptied, incoming ${incRem} left`
            : `filled <strong>${fill}@${topPrice}</strong> — resting order now ${restRem}, incoming ${incRem} left`,
          run: () => {
            visIncomingQty(incRem);
            if (full) visHot(topId);
            else { visSetQty(topId, restRem); visFlash(topId); }
          },
        });

        if (full) {
          level.orders.shift();
          steps.push({
            line: 17,
            caption: `resting order fully consumed — <strong>pop_front</strong>`,
            run: () => visRemove(topId),
          });
          if (level.orders.length === 0) {
            opp.shift();
            steps.push({
              line: 18,
              caption: `price level <strong>${topPrice}</strong> now empty — <strong>erase</strong> it`,
              run: () => relayout(),
            });
          }
        }
      }

      const filled = qty - remaining;
      const sum = fills.reduce((s, f) => s + f.price * f.qty, 0);
      const avg = filled ? sum / filled : 0;
      const avgStr = String(Math.round(avg * 100) / 100);
      const fillsStr = fills.map(f => `${f.qty}@${f.price}`).join(" then ") || "nothing";

      if (remaining === 0) {
        steps.push({
          line: 9,
          caption: `✓ ${sideWord} ${qty} fully filled — <strong>${fillsStr}</strong>, avg <strong>${avgStr}</strong>`,
          run: () => visIncomingDone("filled"),
        });
      } else if (market) {
        steps.push({
          line: 20,
          caption: `book exhausted — filled ${filled} (<strong>${fillsStr}</strong>), <strong>${remaining}</strong> unfilled (market order not rested)`,
          run: () => visIncomingDone("cancel"),
        });
      } else {
        const restSide = buy ? "bid" : "ask";
        const id = nextId++;
        insertResting(restSide, price, remaining, id);
        const remc = remaining;
        steps.push({
          line: 26,
          caption: filled
            ? `filled ${filled} (<strong>${fillsStr}</strong>, avg ${avgStr}) — <strong>${remc} @ ${price}</strong> rests as ${restSide} (FIFO)`
            : `no cross — <strong>${remc} @ ${price}</strong> rests as ${restSide} (price-time priority: appended after existing @ ${price})`,
          run: () => { visIncomingDone("rest"); visInsert(restSide, price, remc, id); },
        });
      }

      const result = { filled, remainder: remaining, avg, fills: fills.slice() };
      return { steps, result };
    }

    /* ── reset / seed ─────────────────────────────────────────── */
    function clearAll() {
      shadow.bids.length = 0; shadow.asks.length = 0;   // keep the object stable
      vis.bids.length = 0; vis.asks.length = 0;
      cellById.clear();
      nextId = 1;
      incoming = null;
      gCells.innerHTML = ""; gInc.innerHTML = "";
      relayout();
    }
    function seed(side, price, qty) {
      const id = nextId++;
      insertResting(side, price, qty, id);
      visInsert(side, price, qty, id);
    }
    function reset() {
      clearAll();
      seed("ask", 104, 40); seed("ask", 103, 25); seed("ask", 103, 15);
      seed("bid", 99, 30); seed("bid", 98, 45); seed("bid", 97, 20);
      relayout();
      player.caption("submit a crossing order — watch it <strong>match</strong> the best opposite level, then rest the remainder");
    }

    /* ── controls ─────────────────────────────────────────────── */
    const priceIn = LabsCore.numInput("price", 100);
    const qtyIn = LabsCore.numInput("qty", 20);
    const P = () => (priceIn.value === "" ? 100 : Number(priceIn.value));
    const Q = () => (qtyIn.value === "" ? 20 : Number(qtyIn.value));
    const fire = o => player.enqueue(genOrder(o).steps);

    function randomFlow() {
      const mid = bestMid();
      const steps = [];
      for (let k = 0; k < 6; k++) {
        const buy = Math.random() < 0.5;
        const q = 5 + Math.floor(Math.random() * 55);
        const off = 1 + Math.floor(Math.random() * 6);
        const px = buy ? mid - off : mid + off;
        steps.push(...genOrder({ buy, price: px, qty: q, market: false }).steps);
      }
      player.enqueue(steps);
    }

    controls.append(
      priceIn, qtyIn,
      LabsCore.button("buy limit", () => fire({ buy: true, price: P(), qty: Q(), market: false })),
      LabsCore.button("sell limit", () => fire({ buy: false, price: P(), qty: Q(), market: false })),
      LabsCore.button("market buy", () => fire({ buy: true, price: P(), qty: Q(), market: true })),
      LabsCore.button("market sell", () => fire({ buy: false, price: P(), qty: Q(), market: true })),
      LabsCore.button("random flow", randomFlow),
      LabsCore.button("clear", () => { player.clear(); clearAll(); player.caption("book cleared — add resting orders or random flow"); }),
      stats,
    );

    player.onReset(reset);
    reset();
    qtyIn.addEventListener("keydown", e => {
      if (e.key === "Enter") fire({ buy: true, price: P(), qty: Q(), market: false });
    });

    /* ── debug handle for headless shadow-logic tests ─────────── */
    window.__ob = {
      get book() { return shadow; },
      submit(o) {
        const { steps, result } = genOrder({
          buy: !!o.buy, price: o.price, qty: o.qty, market: !!o.market,
        });
        steps.forEach(s => { try { s.run(); } catch (e) {} });   // keep vis in sync
        return result;
      },
      reset: clearAll,
    };
  },
});
