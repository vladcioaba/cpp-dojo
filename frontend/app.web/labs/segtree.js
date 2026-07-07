/* lab: segment tree — watch build() fill nodes bottom-up with range sums,
   then watch query() touch only O(log n) of them. */

LabsCore.register({
  id: "segtree",
  title: "seg tree",
  file: "segtree.hpp",
  cpp: `struct segtree {
    int n;                        // number of leaves
    std::vector<long long> t;     // 1-based: t[1] = root
    segtree(const std::vector<int>& a) : n(a.size()), t(4 * n) {
        build(a, 1, 0, n - 1);
    }
    void build(const std::vector<int>& a, int node, int l, int r) {
        if (l == r) { t[node] = a[l]; return; }
        int mid = (l + r) / 2;
        build(a, 2*node,   l,     mid);
        build(a, 2*node+1, mid+1, r);
        t[node] = t[2*node] + t[2*node+1];
    }
    long long query(int node, int l, int r, int ql, int qr) {
        if (qr < l || r < ql) return 0;          // disjoint
        if (ql <= l && r <= qr) return t[node];  // covered
        int mid = (l + r) / 2;
        return query(2*node,   l,     mid, ql, qr)
             + query(2*node+1, mid+1, r,  ql, qr);
    }
};`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;
    const R = 22, LVL_H = 75, LEAF_W = 56, CELL = 40;

    const svg = svgEl("svg", {}, stage);
    const gEdges = svgEl("g", {}, svg);
    const gNodes = svgEl("g", {}, svg);
    const gLeaves = svgEl("g", {}, svg);

    // shadow model
    let arr = [];          // input values
    let t = {};            // t[node] = sum (sim)
    let totalNodes = 0;
    // visual state
    let nodes = {};        // node idx → {g, txt}
    let maxDepth = 0, arrY = LVL_H + 24;

    const stats = LabsCore.note("");

    function depthOf(l, r, d = 0) {
      if (l === r) return d;
      const mid = (l + r) >> 1;
      return Math.max(depthOf(l, mid, d + 1), depthOf(mid + 1, r, d + 1));
    }

    function nodeXY(l, r, depth) {
      return { x: ((l + r) / 2 + 0.5) * LEAF_W, y: depth * LVL_H + R };
    }

    function refit() {
      const w = Math.max(arr.length, 1) * LEAF_W;
      const { capped } = fitStage(svg, stage, w, arrY + CELL, 0.5);
      stats.textContent = `n=${arr.length} nodes=${totalNodes}` +
        (capped ? "  ·  zoom capped, scroll" : "");
    }

    function setLeaves(values) {
      gEdges.innerHTML = ""; gNodes.innerHTML = ""; gLeaves.innerHTML = "";
      nodes = {};
      values.forEach((v, i) => {
        const g = svgEl("g", { class: "vcell" }, gLeaves);
        g.setAttribute("transform",
          `translate(${i * LEAF_W + (LEAF_W - CELL) / 2}, ${arrY})`);
        svgEl("rect", { width: CELL, height: CELL, rx: 6 }, g);
        const txt = svgEl("text", { x: CELL / 2, y: CELL / 2 + 5, "font-size": 13 }, g);
        txt.textContent = v;
        const lbl = svgEl("text", {
          class: "svg-label", x: CELL / 2, y: CELL + 14, "text-anchor": "middle",
        }, g);
        lbl.textContent = i;
      });
      refit();
    }

    function drawNode(node, l, r, depth) {
      const { x, y } = nodeXY(l, r, depth);
      const g = svgEl("g", { class: "nnode hot" }, gNodes);
      g.setAttribute("transform", `translate(${x}, ${y})`);
      svgEl("circle", { r: R }, g);
      const txt = svgEl("text", { "font-size": 12 }, g);
      const lbl = svgEl("text", {
        class: "svg-label", y: R + 14, "text-anchor": "middle",
      }, g);
      lbl.textContent = l === r ? `${l}` : `${l}..${r}`;
      nodes[node] = { g, txt };
      if (node > 1) {
        const pm = nodeMeta[node >> 1];
        const pxy = nodeXY(pm.l, pm.r, pm.depth);
        svgEl("line", {
          class: "nedge", x1: x, y1: y - R, x2: pxy.x, y2: pxy.y + R,
        }, gEdges);
      }
    }

    function fillNode(node, val, leafIdx) {
      const nd = nodes[node];
      if (!nd) return;
      nd.txt.textContent = val;
      nd.g.classList.remove("hot");
      nd.g.classList.add("ok");
      setTimeout(() => nd.g.classList.remove("ok"), 500);
      if (leafIdx != null) {
        const cell = gLeaves.children[leafIdx];
        cell?.classList.add("hot");
        setTimeout(() => cell?.classList.remove("hot"), 500);
      }
    }

    function clearMarks() {
      for (const { g } of Object.values(nodes)) {
        g.classList.remove("hot", "ok");
        g.style.opacity = "";
      }
    }

    /* ── build ─────────────────────────────────────────────────── */

    let nodeMeta = {};   // node idx → {l, r, depth} (known at generation time)

    function buildRec(node, l, r, depth, steps) {
      nodeMeta[node] = { l, r, depth };
      totalNodes++;
      steps.push({
        line: 7,
        caption: `build(node ${node}, [${l}..${r}]) — descend`,
        run: () => drawNode(node, l, r, depth),
      });
      if (l === r) {
        const v = arr[l];
        t[node] = v;
        steps.push({
          line: 8,
          caption: `leaf — t[${node}] = a[${l}] = <strong>${v}</strong>`,
          run: () => fillNode(node, v, l),
        });
        return;
      }
      const mid = (l + r) >> 1;
      buildRec(2 * node, l, mid, depth + 1, steps);
      buildRec(2 * node + 1, mid + 1, r, depth + 1, steps);
      const lv = t[2 * node], rv = t[2 * node + 1];
      const sum = lv + rv;
      t[node] = sum;
      steps.push({
        line: 12,
        caption: `node [${l}..${r}] = ${lv} + ${rv} = <strong>${sum}</strong> — parents fill bottom-up`,
        run: () => fillNode(node, sum),
      });
    }

    function buildSteps(values) {
      const steps = [];
      arr = values.slice();
      t = {}; nodeMeta = {}; totalNodes = 0;
      maxDepth = depthOf(0, arr.length - 1);
      arrY = (maxDepth + 1) * LVL_H + 24;
      steps.push({
        line: 4,
        caption: `input array [${arr.join(", ")}] — building sum tree over it`,
        run: () => setLeaves(arr),
      });
      buildRec(1, 0, arr.length - 1, 0, steps);
      const tn = totalNodes;
      steps.push({
        line: 5,
        caption: `✓ built — <strong>${tn}</strong> nodes cover every range, root t[1] = ${t[1]}`,
        run: () => { clearMarks(); refit(); },
      });
      return steps;
    }

    /* ── query ─────────────────────────────────────────────────── */

    function queryRec(node, l, r, ql, qr, steps, acc) {
      acc.touched++;
      steps.push({
        line: 14,
        caption: `query(node ${node}, [${l}..${r}]) vs [${ql}..${qr}]`,
        run: () => nodes[node]?.g.classList.add("hot"),
      });
      if (qr < l || r < ql) {
        steps.push({
          line: 15,
          caption: `[${l}..${r}] ∩ [${ql}..${qr}] = ∅ — return 0, prune this subtree`,
          run: () => {
            const nd = nodes[node];
            if (nd) { nd.g.classList.remove("hot"); nd.g.style.opacity = "0.3"; }
          },
        });
        return 0;
      }
      if (ql <= l && r <= qr) {
        const v = t[node];
        acc.sum += v;
        const s = acc.sum;
        steps.push({
          line: 16,
          caption: `[${l}..${r}] ⊆ [${ql}..${qr}] — take t[${node}] = <strong>${v}</strong>, sum so far ${s}`,
          run: () => {
            const nd = nodes[node];
            if (nd) { nd.g.classList.remove("hot"); nd.g.classList.add("ok"); }
          },
        });
        return v;
      }
      const mid = (l + r) >> 1;
      const a = queryRec(2 * node, l, mid, ql, qr, steps, acc);
      const b = queryRec(2 * node + 1, mid + 1, r, ql, qr, steps, acc);
      return a + b;
    }

    function querySteps(ql, qr) {
      if (!arr.length)
        return [{ line: 0, caption: "build the tree first", run: () => {} }];
      ql = Math.max(0, Math.min(arr.length - 1, ql));
      qr = Math.max(0, Math.min(arr.length - 1, qr));
      if (ql > qr) [ql, qr] = [qr, ql];
      const steps = [];
      steps.push({
        line: 14,
        caption: `sum of [${ql}..${qr}] — walk from the root`,
        run: clearMarks,
      });
      const acc = { sum: 0, touched: 0 };
      queryRec(1, 0, arr.length - 1, ql, qr, steps, acc);
      steps.push({
        line: 19,
        caption: `✓ sum[${ql}..${qr}] = <strong>${acc.sum}</strong> — touched ${acc.touched} of ${totalNodes} nodes (O(log n))`,
        run: () => {},
      });
      return steps;
    }

    function reset() {
      arr = []; t = {}; nodeMeta = {}; totalNodes = 0;
      maxDepth = 0; arrY = LVL_H + 24;
      gEdges.innerHTML = ""; gNodes.innerHTML = ""; gLeaves.innerHTML = "";
      nodes = {};
      refit();
      player.caption("enter leaf values and build — then query a range");
    }

    const valsIn = document.createElement("input");
    valsIn.type = "text";
    valsIn.value = "5,8,6,3,2,7,2,6";
    valsIn.style.width = "200px";
    const qlIn = LabsCore.numInput("l", 2);
    const qrIn = LabsCore.numInput("r", 5);
    qlIn.style.width = qrIn.style.width = "56px";

    controls.append(
      valsIn,
      LabsCore.button("build ▸", () => {
        const values = valsIn.value.split(",").map(s => Number(s.trim()))
          .filter(Number.isFinite).slice(0, 16);
        if (!values.length) { player.caption("need some numbers, e.g. 5,8,6,3"); return; }
        player.clear();
        player.enqueue(buildSteps(values));
      }),
      qlIn, qrIn,
      LabsCore.button("query l..r ▸", () => {
        player.enqueue(querySteps(Number(qlIn.value || 0), Number(qrIn.value || 0)));
      }),
      LabsCore.button("clear", () => { player.clear(); reset(); }),
      stats,
    );

    player.onReset(reset);
    reset();
  },
});
