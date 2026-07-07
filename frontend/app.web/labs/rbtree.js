/* lab: red-black tree — insert and watch it balance itself: recolors push
   the problem up, rotations fix it for good. Sorted input stays logarithmic. */

LabsCore.register({
  id: "rbtree",
  title: "rb tree",
  file: "rbtree.hpp",
  cpp: `enum Color { RED, BLACK };
struct Node { int v; Color c = RED; Node *l, *r, *p; };

void insert(int x) {
    Node* z = bst_insert(x);        // new nodes are RED
    while (z->p && z->p->c == RED) {
        Node* g = z->p->p;
        Node* uncle = (z->p == g->l) ? g->r : g->l;
        if (uncle && uncle->c == RED) {
            z->p->c  = BLACK;       // case 1: red uncle →
            uncle->c = BLACK;       //   recolor and push the
            g->c     = RED;         //   problem two levels up
            z = g;
        } else {
            if (is_inner_child(z))  // case 2: straighten the
                rotate(z = z->p);   //   zig-zag first
            z->p->c = BLACK;        // case 3: rotate grandparent,
            g->c    = RED;          //   done — loop exits
            rotate_other_way(g);
        }
    }
    root->c = BLACK;                // rule: root is always black
}`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;
    const svg = svgEl("svg", {}, stage);
    const view = TreeView(svg, svgEl);

    let root = null, nextId = 1;
    const stats = LabsCore.note("");

    /* shadow red-black tree; nodes: {v, red, l, r, p, id}; cls derived */
    function setCls(n) { if (n) { n.cls = n.red ? "red" : "black"; setCls(n.l); setCls(n.r); } }
    function layoutNow() { setCls(root); return TreeView.layoutBinary(root); }

    function applyStep(layout, marks, caption, line) {
      return {
        caption, line,
        run: () => {
          view.apply(layout.snap, marks);
          fitStage(svg, stage, Math.max(layout.w, 56), Math.max(layout.h, 72) + 44, 0.5);
        },
      };
    }

    function rotateLeft(x) {
      const y = x.r;
      x.r = y.l; if (y.l) y.l.p = x;
      y.p = x.p;
      if (!x.p) root = y;
      else if (x === x.p.l) x.p.l = y;
      else x.p.r = y;
      y.l = x; x.p = y;
    }
    function rotateRight(x) {
      const y = x.l;
      x.l = y.r; if (y.r) y.r.p = x;
      y.p = x.p;
      if (!x.p) root = y;
      else if (x === x.p.r) x.p.r = y;
      else x.p.l = y;
      y.r = x; x.p = y;
    }

    function height(n) { return n ? 1 + Math.max(height(n.l), height(n.r)) : 0; }
    function blackHeight(n) {
      let h = 0;
      for (let c = n; c; c = c.l) if (!c.red) h++;
      return h;
    }
    function count(n) { return n ? 1 + count(n.l) + count(n.r) : 0; }
    function updStats() {
      stats.textContent = root
        ? `n=${count(root)} height=${height(root)} black-height=${blackHeight(root)}`
        : "n=0";
    }

    function insertSteps(x) {
      const steps = [];
      // BST descent
      let cur = root, parent = null;
      const before = layoutNow();
      while (cur) {
        const c = cur;
        if (x === c.v) {
          steps.push(applyStep(before, { [c.id]: "hot" }, `${x} already present — ignored`, 5));
          return steps;
        }
        steps.push(applyStep(before, { [c.id]: "hot" },
          `${x} ${x < c.v ? "&lt;" : "&gt;"} ${c.v} → ${x < c.v ? "left" : "right"}`, 5));
        parent = c;
        cur = x < c.v ? c.l : c.r;
      }
      const z0 = { v: x, red: true, l: null, r: null, p: parent, id: nextId++ };
      if (!parent) root = z0;
      else if (x < parent.v) parent.l = z0; else parent.r = z0;
      steps.push(applyStep(layoutNow(), { [z0.id]: "hot" },
        `insert <strong>${x}</strong> as a <strong>red</strong> leaf — red is cheap, it breaks no black-height`, 5));

      // fixup
      let z = z0;
      while (z.p && z.p.red) {
        const g = z.p.p;
        const uncle = z.p === g.l ? g.r : g.l;
        if (uncle && uncle.red) {
          z.p.red = false; uncle.red = false; g.red = true;
          const marks = { [z.p.id]: "hot", [uncle.id]: "hot", [g.id]: "hot" };
          z = g;
          steps.push(applyStep(layoutNow(), marks,
            `<strong>case 1:</strong> uncle is red → recolor parent + uncle black, grandparent red. Problem pushed up`, 10));
        } else {
          const leftSide = z.p === g.l;
          const inner = leftSide ? z === z.p.r : z === z.p.l;
          if (inner) {
            const old = z.p;
            z = z.p;
            leftSide ? rotateLeft(z) : rotateRight(z);
            steps.push(applyStep(layoutNow(), { [old.id]: "hot" },
              `<strong>case 2:</strong> zig-zag — rotate ${leftSide ? "left" : "right"} at the parent to straighten it`, 16));
          }
          z.p.red = false; g.red = true;
          steps.push(applyStep(layoutNow(), { [z.p.id]: "hot", [g.id]: "hot" },
            `<strong>case 3:</strong> recolor — parent black, grandparent red…`, 17));
          (z.p === g.l ? rotateRight : rotateLeft)(g);
          steps.push(applyStep(layoutNow(), {},
            `…then <strong>rotate the grandparent</strong> — watch everything glide into balance`, 19));
        }
      }
      if (root.red) {
        root.red = false;
        steps.push(applyStep(layoutNow(), { [root.id]: "hot" },
          `root painted <strong>black</strong> — rule of the house`, 22));
      } else {
        steps.push(applyStep(layoutNow(), {}, "", 22));
      }
      steps.push({ caption: null, run: updStats });
      return steps;
    }

    function reset() {
      root = null; nextId = 1;
      view.clear();
      updStats();
      player.caption("insert — red nodes are fresh, rotations keep the tree shallow");
    }

    const input = LabsCore.numInput("value", 50);
    controls.append(
      input,
      LabsCore.button("insert ▸", () => {
        const v = input.value === "" ? Math.floor(Math.random() * 99) : Number(input.value);
        input.value = "";
        player.enqueue(insertSteps(v));
      }),
      LabsCore.button("insert ×10 random", () => {
        const used = new Set(), steps = [];
        while (used.size < 10) {
          const v = Math.floor(Math.random() * 99);
          if (!used.has(v)) { used.add(v); steps.push(...insertSteps(v)); }
        }
        player.enqueue(steps);
      }),
      LabsCore.button("insert 1..15 in order", () => {
        player.clear(); reset();
        const steps = [];
        for (let v = 1; v <= 15; v++) steps.push(...insertSteps(v));
        steps.push({
          caption: "15 sorted inserts, height stays <strong>≈ log₂ n</strong> — " +
            "the plain BST made a 15-deep list from this exact input",
          run: updStats,
        });
        player.enqueue(steps);
      }),
      LabsCore.button("clear", () => { player.clear(); reset(); }),
      stats,
    );

    player.onReset(reset);
    reset();
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") controls.querySelector("button").click();
    });

    // debug handle for tests
    window.__rbtree = { get root() { return root; }, height, blackHeight };
  },
});
