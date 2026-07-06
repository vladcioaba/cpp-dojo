/* lab: max-heap — array AND implicit tree drawn together, because a heap
   IS an array. push (sift_up), pop (sift_down), Floyd's O(n) build. */

LabsCore.register({
  id: "heap",
  title: "heap",
  file: "heap.hpp",
  cpp: `class max_heap {
    std::vector<int> a;
public:
    max_heap(std::vector<int> v) : a(std::move(v)) {
        for (size_t i = a.size() / 2; i-- > 0; )
            sift_down(i);          // Floyd build: O(n)
    }
    void push(int x) {
        a.push_back(x);
        sift_up(a.size() - 1);
    }
    int pop() {
        int top = a[0];
        a[0] = a.back(); a.pop_back();
        sift_down(0);
        return top;
    }
private:
    void sift_up(size_t i) {
        while (i > 0 && a[i] > a[(i-1)/2]) {
            std::swap(a[i], a[(i-1)/2]);
            i = (i-1)/2;
        }
    }
    void sift_down(size_t i) {
        for (;;) {
            size_t l = 2*i+1, r = 2*i+2, m = i;
            if (l < a.size() && a[l] > a[m]) m = l;
            if (r < a.size() && a[r] > a[m]) m = r;
            if (m == i) break;
            std::swap(a[i], a[m]);
            i = m;
        }
    }
};`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;
    const R = 20, LVL_H = 70, CELL = 40, GAP = 4;

    const svg = svgEl("svg", {}, stage);
    const gEdges = svgEl("g", {}, svg);
    const gTree = svgEl("g", {}, svg);
    const gArr = svgEl("g", {}, svg);

    // shadow model — steps are generated eagerly against this
    let model = [];
    // visual state — run() closures mutate only this
    let els = [];     // els[slot] = {g, txt} value-carrier currently shown at slot
    let arrEls = [];  // same for the array row
    let edges = [];   // edges[slot] = line slot→parent (slot >= 1)
    let vn = 0;       // visual element count
    let maxD = 0, W = 224, arrY = LVL_H + 24;

    const stats = LabsCore.note("");

    function depthOf(i) { return Math.floor(Math.log2(i + 1)); }

    function updateLayout() {
      maxD = vn > 0 ? depthOf(vn - 1) : 0;
      W = Math.max(2 ** maxD * 56, 224);
      arrY = (maxD + 1) * LVL_H + 24;
    }

    function treePos(i) {
      const d = depthOf(i);
      const p = i - (2 ** d - 1);
      return { x: (p + 0.5) * (W / 2 ** d), y: d * LVL_H + R };
    }

    function place(el, slot) {
      const { x, y } = treePos(slot);
      el.g.setAttribute("transform", `translate(${x}, ${y})`);
    }
    function placeArr(el, slot) {
      el.g.setAttribute("transform", `translate(${slot * (CELL + GAP)}, ${arrY})`);
    }

    function relayout() {
      updateLayout();
      els.forEach((el, i) => el && place(el, i));
      arrEls.forEach((el, i) => el && placeArr(el, i));
      edges.forEach((ln, i) => {
        if (!ln) return;
        const a = treePos(i), b = treePos((i - 1) >> 1);
        ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y);
        ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
      });
      const w = Math.max(W, vn * (CELL + GAP), 1);
      const { capped } = fitStage(svg, stage, w, arrY + CELL, 0.5);
      stats.textContent = `n=${vn}` + (capped ? "  ·  zoom capped, scroll" : "");
    }

    function mkNode(v) {
      const g = svgEl("g", { class: "nnode" }, gTree);
      svgEl("circle", { r: R }, g);
      const txt = svgEl("text", { "font-size": 13 }, g);
      txt.textContent = v;
      return { g, txt };
    }
    function mkCell(v) {
      const g = svgEl("g", { class: "vcell" }, gArr);
      svgEl("rect", { width: CELL, height: CELL, rx: 6 }, g);
      const txt = svgEl("text", { x: CELL / 2, y: CELL / 2 + 5, "font-size": 13 }, g);
      txt.textContent = v;
      return { g, txt };
    }

    function addNode(v) {
      const slot = vn;
      vn++;
      updateLayout();
      const node = mkNode(v);
      els[slot] = node;
      arrEls[slot] = mkCell(v);
      if (slot > 0) edges[slot] = svgEl("line", { class: "nedge" }, gEdges);
      relayout();
    }

    function setAll(values) {
      gEdges.innerHTML = ""; gTree.innerHTML = ""; gArr.innerHTML = "";
      els = []; arrEls = []; edges = [];
      vn = 0;
      values.forEach(v => addNode(v));
    }

    function clearHot() {
      svg.querySelectorAll(".hot").forEach(el => el.classList.remove("hot"));
    }
    function hot(slot) {
      els[slot]?.g.classList.add("hot");
      arrEls[slot]?.g.classList.add("hot");
    }

    function swapEls(i, j) {
      const a = els[i]; els[i] = els[j]; els[j] = a;
      place(els[i], i); place(els[j], j);
      const c = arrEls[i]; arrEls[i] = arrEls[j]; arrEls[j] = c;
      placeArr(arrEls[i], i); placeArr(arrEls[j], j);
    }

    function removeTop(replaceWithLast) {
      els[0].g.remove(); arrEls[0].g.remove();
      const last = vn - 1;
      if (replaceWithLast && last > 0) {
        els[0] = els[last]; arrEls[0] = arrEls[last];
        place(els[0], 0); placeArr(arrEls[0], 0);
      }
      els.length = last; arrEls.length = last;
      if (last > 0) { edges[last]?.remove(); edges.length = last; }
      vn = last;
      relayout();
    }

    /* ── step generators (mutate `model`, close over indices/values) ── */

    function siftUpSteps(start) {
      const steps = [];
      let i = start;
      while (i > 0) {
        const p = (i - 1) >> 1;
        const gt = model[i] > model[p];
        const [vi, vp, ii, pp] = [model[i], model[p], i, p];
        steps.push({
          line: 20,
          caption: gt
            ? `a[${ii}]=${vi} &gt; a[${pp}]=${vp} — parent smaller, <strong>swap</strong>`
            : `a[${ii}]=${vi} ≤ a[${pp}]=${vp} — heap property holds, stop`,
          run: () => { clearHot(); hot(ii); hot(pp); },
        });
        if (!gt) break;
        [model[i], model[p]] = [model[p], model[i]];
        steps.push({
          line: 21,
          caption: `<strong>${vi}</strong> bubbles up to slot ${pp}`,
          run: () => swapEls(ii, pp),
        });
        i = p;
      }
      return steps;
    }

    function siftDownSteps(start) {
      const steps = [];
      let i = start;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < model.length && model[l] > model[m]) m = l;
        if (r < model.length && model[r] > model[m]) m = r;
        const [ii, mm, len] = [i, m, model.length];
        const stop = m === i;
        steps.push({
          line: 28,
          caption: stop
            ? (l >= len ? `a[${ii}] is a leaf — stop` : `children ≤ a[${ii}]=${model[i]} — stop`)
            : `largest child a[${mm}]=${model[m]} &gt; a[${ii}]=${model[i]}`,
          run: () => {
            clearHot(); hot(ii);
            if (l < len) hot(l);
            if (r < len) hot(r);
          },
        });
        if (stop) break;
        const [vi, vm] = [model[i], model[m]];
        [model[i], model[m]] = [model[m], model[i]];
        steps.push({
          line: 31,
          caption: `swap a[${ii}]=${vi} ↔ a[${mm}]=${vm} — <strong>${vi}</strong> sinks`,
          run: () => swapEls(ii, mm),
        });
        i = m;
      }
      return steps;
    }

    function pushSteps(x) {
      const steps = [];
      model.push(x);
      const slot = model.length - 1;
      steps.push({
        line: 9,
        caption: `a.push_back(<strong>${x}</strong>) — new leaf at slot ${slot}, tree and array grow together`,
        run: () => addNode(x),
      });
      steps.push(...siftUpSteps(slot));
      steps.push({ line: 0, caption: `✓ heap property restored`, run: clearHot });
      return steps;
    }

    function popSteps() {
      if (!model.length)
        return [{ line: 0, caption: "heap is empty — nothing to pop", run: clearHot }];
      const steps = [];
      const top = model[0];
      steps.push({
        line: 13,
        caption: `top = a[0] = <strong>${top}</strong> — the max lives at the root`,
        run: () => { clearHot(); hot(0); },
      });
      const last = model.length - 1;
      const lastVal = model[last];
      model[0] = model[last];
      model.pop();
      if (last === 0) {
        steps.push({
          line: 14,
          caption: `pop_back() — heap is now empty, return ${top}`,
          run: () => { clearHot(); removeTop(false); },
        });
      } else {
        steps.push({
          line: 14,
          caption: `a[0] = a.back() = <strong>${lastVal}</strong>; pop_back() — last leaf takes the root`,
          run: () => { clearHot(); removeTop(true); },
        });
        steps.push(...siftDownSteps(0));
      }
      steps.push({ line: 16, caption: `popped <strong>${top}</strong> ✓`, run: clearHot });
      return steps;
    }

    function buildSteps(values) {
      const steps = [];
      model = values.slice();
      const vals = values.slice();
      steps.push({
        line: 4,
        caption: `start from unsorted array [${vals.join(", ")}] — not a heap yet`,
        run: () => setAll(vals),
      });
      for (let i = (model.length >> 1) - 1; i >= 0; i--) {
        const ii = i;
        steps.push({
          line: 5,
          caption: `Floyd: heapify internal nodes right-to-left — <strong>sift_down(${ii})</strong>`,
          run: () => { clearHot(); hot(ii); },
        });
        steps.push(...siftDownSteps(i));
      }
      steps.push({
        line: 6,
        caption: `✓ heap built bottom-up in <strong>O(n)</strong> — cheaper than n pushes (O(n log n))`,
        run: clearHot,
      });
      return steps;
    }

    function reset() {
      model = [];
      setAll([]);
      player.caption("push values, or build a heap from a random array");
    }

    const input = LabsCore.numInput("value", 42);
    controls.append(
      input,
      LabsCore.button("push ▸", () => {
        const v = input.value === "" ? Math.floor(Math.random() * 99) : Number(input.value);
        input.value = "";
        player.enqueue(pushSteps(v));
      }),
      LabsCore.button("push ×7", () => {
        const steps = [];
        for (let k = 0; k < 7; k++) steps.push(...pushSteps(Math.floor(Math.random() * 99)));
        player.enqueue(steps);
      }),
      LabsCore.button("pop max", () => player.enqueue(popSteps())),
      LabsCore.button("build from random array", () => {
        player.clear();
        const vals = Array.from({ length: 10 }, () => Math.floor(Math.random() * 99));
        player.enqueue(buildSteps(vals));
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
