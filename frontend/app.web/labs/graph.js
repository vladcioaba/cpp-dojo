/* lab: graph search — BFS ring, DFS dive, A* beeline. Click cells to draw
   walls, then race the three algorithms over the same maze. */

LabsCore.register({
  id: "graph",
  title: "graph",
  file: "search.hpp",
  cpp: `// grid: 0 = free, 1 = wall.  4-neighbour moves.
bool bfs(Grid& g, Cell s, Cell t) {
    std::queue<Cell> q;  q.push(s);
    while (!q.empty()) {
        Cell c = q.front(); q.pop();
        if (c == t) return true;
        for (Cell n : g.neighbours(c))
            if (!g.visited(n)) { g.mark(n, c); q.push(n); }
    }
    return false;
}
bool dfs(Grid& g, Cell s, Cell t) {
    std::stack<Cell> st;  st.push(s);
    while (!st.empty()) {
        Cell c = st.top(); st.pop();
        if (c == t) return true;
        for (Cell n : g.neighbours(c))
            if (!g.visited(n)) { g.mark(n, c); st.push(n); }
    }
    return false;
}
int h(Cell a, Cell b) { return abs(a.r - b.r) + abs(a.c - b.c); }
bool astar(Grid& g, Cell s, Cell t) {
    MinHeap open;  open.push({h(s, t), 0, s});
    while (!open.empty()) {
        auto [f, gc, c] = open.pop();   // lowest f = g + h wins
        if (c == t) return true;
        for (Cell n : g.neighbours(c))
            if (g.relax(n, gc + 1))
                open.push({gc + 1 + h(n, t), gc + 1, n});
    }
    return false;
}`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;
    const COLS = 20, ROWS = 12, CELL = 26, GAP = 2;
    const S = { r: 1, c: 1 }, G = { r: ROWS - 2, c: COLS - 2 };

    const svg = svgEl("svg", {}, stage);
    const gCells = svgEl("g", {}, svg);

    let walls = new Set();          // "r,c"
    const rects = [];               // rects[r][c]
    const key = (r, c) => r + "," + c;

    const FILL = {
      free: "var(--panel-2)",
      wall: "var(--ink)",
      frontier: "color-mix(in srgb, var(--amber) 30%, var(--panel-2))",
      visited: "color-mix(in srgb, var(--blue) 25%, var(--panel-2))",
      path: "color-mix(in srgb, var(--lime) 45%, var(--panel-2))",
    };

    function paint(r, c, kind) {
      rects[r][c].setAttribute("fill", walls.has(key(r, c)) ? FILL.wall : FILL[kind]);
    }

    function drawGrid() {
      gCells.innerHTML = "";
      for (let r = 0; r < ROWS; r++) {
        rects[r] = [];
        for (let c = 0; c < COLS; c++) {
          const rect = svgEl("rect", {
            x: c * (CELL + GAP), y: r * (CELL + GAP),
            width: CELL, height: CELL, rx: 4,
            fill: walls.has(key(r, c)) ? FILL.wall : FILL.free,
            stroke: "var(--border)",
          }, gCells);
          rect.style.cursor = "pointer";
          rect.addEventListener("click", () => {
            if ((r === S.r && c === S.c) || (r === G.r && c === G.c)) return;
            const k = key(r, c);
            walls.has(k) ? walls.delete(k) : walls.add(k);
            paint(r, c, "free");
          });
          rects[r][c] = rect;
        }
      }
      for (const [cell, label] of [[S, "S"], [G, "G"]]) {
        const t = svgEl("text", {
          x: cell.c * (CELL + GAP) + CELL / 2, y: cell.r * (CELL + GAP) + CELL / 2 + 5,
          "text-anchor": "middle", "font-size": 14, "font-weight": 700,
          fill: "var(--lime)", "font-family": "var(--mono)", "pointer-events": "none",
        }, gCells);
        t.textContent = label;
      }
      fitStage(svg, stage, COLS * (CELL + GAP), ROWS * (CELL + GAP), 0.6);
    }

    function neighbours(r, c) {
      return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !walls.has(key(nr, nc)));
    }

    /* Run search eagerly on the shadow grid; emit one step per expansion. */
    function searchSteps(algo) {
      const steps = [];
      const prev = new Map();          // key -> parent key
      const gScore = new Map([[key(S.r, S.c), 0]]);
      let container, popLine, pushLine, name;

      if (algo === "bfs") { container = [[0, S.r, S.c]]; popLine = 5; pushLine = 8; name = "bfs"; }
      else if (algo === "dfs") { container = [[0, S.r, S.c]]; popLine = 15; pushLine = 18; name = "dfs"; }
      else { container = [[manhattan(S, G), S.r, S.c]]; popLine = 27; pushLine = 31; name = "astar"; }

      function manhattan(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c); }

      const seen = new Set([key(S.r, S.c)]);
      let visited = 0, found = false;

      while (container.length) {
        let node;
        if (algo === "bfs") node = container.shift();
        else if (algo === "dfs") node = container.pop();
        else {
          container.sort((a, b) => a[0] - b[0]); // toy priority_queue
          node = container.shift();
        }
        const [f, r, c] = node;
        visited++;
        const cap = algo === "bfs"
          ? `queue pops (${r},${c}) — the ring expands evenly`
          : algo === "dfs"
            ? `stack pops (${r},${c}) — dive deep, backtrack later`
            : `pop lowest f=${f} at (${r},${c}) — h pulls the search toward G`;
        steps.push({ line: popLine, caption: cap, run: () => paint(r, c, "visited") });

        if (r === G.r && c === G.c) { found = true; break; }

        for (const [nr, nc] of neighbours(r, c)) {
          const nk = key(nr, nc);
          if (algo === "astar") {
            const ng = gScore.get(key(r, c)) + 1;
            if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
            gScore.set(nk, ng);
            prev.set(nk, key(r, c));
            container.push([ng + manhattan({ r: nr, c: nc }, G), nr, nc]);
          } else {
            if (seen.has(nk)) continue;
            seen.add(nk);
            prev.set(nk, key(r, c));
            container.push([0, nr, nc]);
          }
          steps.push({ line: pushLine, run: () => paint(nr, nc, "frontier") });
        }
      }

      if (!found) {
        steps.push({ caption: `<strong>${name}: no path</strong> — G is walled off (${visited} cells visited)`, run: () => {} });
        return steps;
      }

      const path = [];
      for (let k = key(G.r, G.c); k; k = prev.get(k)) path.push(k.split(",").map(Number));
      path.reverse();
      for (const [r, c] of path) {
        steps.push({ line: 0, run: () => paint(r, c, "path") });
      }
      steps.push({
        caption: `<strong>${name}: path ${path.length} cells, visited ${visited}</strong>` +
          (algo === "astar" ? " — compare that visited count with bfs" : ""),
        run: () => {},
      });
      return steps;
    }

    function clearSearch() {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) paint(r, c, "free");
    }

    function randomWalls() {
      walls = new Set();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if ((r === S.r && c === S.c) || (r === G.r && c === G.c)) continue;
          if (Math.random() < 0.28) walls.add(key(r, c));
        }
      drawGrid();
    }

    function reset() {
      clearSearch();
      player.caption("click cells to draw walls, then run a search");
    }

    controls.append(
      LabsCore.button("bfs ▸", () => { player.clear(); clearSearch(); player.enqueue(searchSteps("bfs")); }),
      LabsCore.button("dfs ▸", () => { player.clear(); clearSearch(); player.enqueue(searchSteps("dfs")); }),
      LabsCore.button("a* ▸", () => { player.clear(); clearSearch(); player.enqueue(searchSteps("astar")); }),
      LabsCore.button("randomize walls", () => { player.clear(); randomWalls(); }),
      LabsCore.button("clear walls", () => { player.clear(); walls = new Set(); drawGrid(); }),
      LabsCore.note("click a cell = toggle wall"),
    );

    player.onReset(reset);
    drawGrid();
    reset();
  },
});
