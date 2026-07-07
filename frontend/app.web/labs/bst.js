/* lab: binary search tree — watch insert/find walk the compare path.
   The "worst case" button shows why unbalanced BSTs are a trap. */

LabsCore.register({
  id: "bst",
  title: "bst",
  file: "bst.hpp",
  cpp: `struct Node { int key; Node *l = nullptr, *r = nullptr; };

void insert(Node*& root, int x) {
    Node** cur = &root;
    while (*cur) {
        if (x < (*cur)->key)      cur = &(*cur)->l;
        else if (x > (*cur)->key) cur = &(*cur)->r;
        else return;              // duplicate
    }
    *cur = new Node{x};
}

Node* find(Node* cur, int x) {
    while (cur) {
        if (x < cur->key)      cur = cur->l;
        else if (x > cur->key) cur = cur->r;
        else return cur;       // found
    }
    return nullptr;            // not here
}`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;

    /* ── tree view (nodes glide via .nnode transform transition) ── */
    const svg = svgEl("svg", {}, stage);
    const gE = svgEl("g", {}, svg);
    const gN = svgEl("g", {}, svg);
    const els = new Map();      // node id -> <g>
    let lastPos = new Map();

    function layout(root) {
      const snap = [];
      let idx = 0, maxD = 0;
      (function walk(n, d, pid) {
        if (!n) return;
        walk(n.l, d + 1, n.id);
        snap.push({ id: n.id, key: n.key, x: idx * 56 + 22, y: d * 72 + 22, parentId: pid });
        idx++;
        maxD = Math.max(maxD, d);
        walk(n.r, d + 1, n.id);
      })(root, 0, null);
      const byId = new Map(snap.map(s => [s.id, s]));
      for (const s of snap) s.par = s.parentId != null ? byId.get(s.parentId) : null;
      return { snap, w: idx ? (idx - 1) * 56 + 44 : 44, h: maxD * 72 + 44, size: idx, height: idx ? maxD + 1 : 0 };
    }

    function apply(view) {
      const seen = new Set();
      let moved = false;
      for (const s of view.snap) {
        seen.add(s.id);
        let g = els.get(s.id);
        if (!g) {
          g = svgEl("g", { class: "nnode", transform: `translate(${s.x},${s.y})` });
          svgEl("circle", { r: 20 }, g);
          const t = svgEl("text", { "font-size": 13 }, g);
          t.textContent = s.key;
          gN.appendChild(g);
          els.set(s.id, g);
        }
        const pos = s.x + "," + s.y;
        if (lastPos.get(s.id) !== pos) { moved = true; lastPos.set(s.id, pos); }
        g.setAttribute("transform", `translate(${s.x},${s.y})`);
      }
      for (const [id, g] of els) if (!seen.has(id)) { g.remove(); els.delete(id); lastPos.delete(id); }
      const drawEdges = () => {
        gE.innerHTML = "";
        for (const s of view.snap) if (s.par)
          svgEl("line", { class: "nedge", x1: s.par.x, y1: s.par.y, x2: s.x, y2: s.y }, gE);
      };
      if (moved) { gE.innerHTML = ""; setTimeout(drawEdges, 500); } else drawEdges();
      fitStage(svg, stage, view.w, view.h, 0.5);
    }

    function flash(id, cls = "hot") {
      const g = els.get(id);
      if (!g) return;
      g.classList.add(cls);
      setTimeout(() => g.classList.remove(cls), 420);
    }

    /* ── shadow model (steps generated eagerly) ─────────────────── */
    let root = null, nextId = 1;
    const stats = LabsCore.note("");

    function insertSteps(x) {
      const steps = [];
      let parent = null, side = null, cur = root;
      while (cur) {
        const c = cur;
        if (x < cur.key) {
          steps.push({ line: 6, caption: `${x} &lt; ${c.key} → go <strong>left</strong>`, run: () => flash(c.id) });
          parent = cur; side = "l"; cur = cur.l;
        } else if (x > cur.key) {
          steps.push({ line: 7, caption: `${x} &gt; ${c.key} → go <strong>right</strong>`, run: () => flash(c.id) });
          parent = cur; side = "r"; cur = cur.r;
        } else {
          steps.push({ line: 8, caption: `${x} is already here — duplicates ignored`, run: () => flash(c.id) });
          return steps;
        }
      }
      const node = { key: x, l: null, r: null, id: nextId++ };
      if (!parent) root = node; else parent[side] = node;
      const v = layout(root);
      steps.push({
        line: 10,
        caption: `*cur = new Node{<strong>${x}</strong>}${parent ? "" : " — first node becomes the root"}`,
        run: () => { apply(v); flash(node.id, "ok"); stats.textContent = `n=${v.size} height=${v.height}`; },
      });
      return steps;
    }

    function findSteps(x) {
      const steps = [];
      let cur = root, d = 0;
      while (cur) {
        const c = cur; d++;
        if (x < cur.key) { steps.push({ line: 15, caption: `${x} &lt; ${c.key} → left`, run: () => flash(c.id) }); cur = cur.l; }
        else if (x > cur.key) { steps.push({ line: 16, caption: `${x} &gt; ${c.key} → right`, run: () => flash(c.id) }); cur = cur.r; }
        else {
          const dd = d;
          steps.push({ line: 17, caption: `<strong>found ${x}</strong> in ${dd} comparison${dd === 1 ? "" : "s"}`, run: () => flash(c.id, "ok") });
          return steps;
        }
      }
      steps.push({ line: 19, caption: `hit nullptr — <strong>${x} isn't here</strong> (${d} comparison${d === 1 ? "" : "s"})`, run: () => {} });
      return steps;
    }

    function reset() {
      root = null; nextId = 1;
      els.clear(); lastPos.clear();
      gE.innerHTML = ""; gN.innerHTML = "";
      fitStage(svg, stage, 44, 44, 0.5);
      stats.textContent = "n=0 height=0";
      player.caption("insert keys — smaller go left, bigger go right");
    }

    const input = LabsCore.numInput("key", 50);
    const val = () => {
      const v = input.value === "" ? Math.floor(Math.random() * 99) : Number(input.value);
      input.value = "";
      return v;
    };
    controls.append(
      input,
      LabsCore.button("insert ▸", () => player.enqueue(insertSteps(val()))),
      LabsCore.button("insert ×7 random", () => {
        const s = [];
        for (let i = 0; i < 7; i++) s.push(...insertSteps(Math.floor(Math.random() * 99)));
        player.enqueue(s);
      }),
      LabsCore.button("find ▸", () => player.enqueue(findSteps(val()))),
      LabsCore.button("worst case 1..7", () => {
        player.clear(); reset();
        const s = [];
        for (let k = 1; k <= 7; k++) s.push(...insertSteps(k));
        s.push({
          line: 0,
          caption: `sorted input → a linked list in disguise: height 7, O(n) lookups. <strong>this is why red-black trees exist →</strong>`,
          run: () => {},
        });
        player.enqueue(s);
      }),
      LabsCore.button("clear", () => { player.clear(); reset(); }),
      stats,
    );

    player.onReset(reset);
    reset();
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") controls.querySelector("button").click();
    });
  },
});
