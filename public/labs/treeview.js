/* Shared node-link tree renderer for labs. Reconciles a position snapshot:
   nodes glide to new spots (CSS transition on transform), edges redraw.
   snap: [{id, v, x, y, pid, cls}] — cls e.g. "red"/"black"; marks: {id: "hot"} */

window.TreeView = function (svg, svgEl) {
  const gE = svgEl("g", {}, svg);
  const gN = svgEl("g", {}, svg);
  const nodes = new Map();
  const R = 20;

  function apply(snap, marks = {}) {
    const pos = new Map(snap.map(s => [s.id, s]));
    gE.innerHTML = "";
    for (const s of snap) {
      const p = pos.get(s.pid);
      if (p) svgEl("line", { class: "nedge", x1: p.x, y1: p.y, x2: s.x, y2: s.y }, gE);
    }
    const seen = new Set();
    for (const s of snap) {
      seen.add(s.id);
      let g = nodes.get(s.id);
      if (!g) {
        g = svgEl("g", { class: "nnode" });
        svgEl("circle", { r: R }, g);
        svgEl("text", { "font-size": 13 }, g);
        g.setAttribute("transform", `translate(${s.x},${s.y})`);
        gN.appendChild(g);
        nodes.set(s.id, g);
      }
      g.setAttribute("transform", `translate(${s.x},${s.y})`);
      g.setAttribute("class", ("nnode " + (s.cls || "") + " " + (marks[s.id] || "")).trim());
      g.querySelector("text").textContent = s.v;
    }
    for (const [id, g] of nodes) if (!seen.has(id)) { g.remove(); nodes.delete(id); }
  }

  function clear() { nodes.clear(); gE.innerHTML = ""; gN.innerHTML = ""; }

  return { apply, clear, R };
};

/* In-order layout for binary trees with .l/.r children. Returns
   {snap, w, h}; each shadow node needs stable .id and value .v. */
window.TreeView.layoutBinary = function (root, opts = {}) {
  const DX = opts.dx || 56, DY = opts.dy || 72;
  const snap = [];
  let xi = 0, maxD = 0;
  (function walk(n, d, parent) {
    if (!n) return;
    walk(n.l, d + 1, n);
    const s = { id: n.id, v: n.v, x: xi++ * DX, y: d * DY, pid: parent ? parent.id : null, cls: n.cls || "" };
    n._x = s.x; n._y = s.y;
    snap.push(s);
    maxD = Math.max(maxD, d);
    walk(n.r, d + 1, n);
  })(root, 0, null);
  return { snap, w: Math.max(xi - 1, 0) * DX, h: maxD * DY };
};
