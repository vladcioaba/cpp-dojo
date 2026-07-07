/* lab: std::vector growth — push elements, watch capacity double and
   elements get copied to the new buffer. Zooms out, then caps + scrolls. */

LabsCore.register({
  id: "vector",
  title: "vector",
  file: "vec.hpp",
  cpp: `template <class T>
class vec {
    T*     data_ = nullptr;
    size_t size_ = 0;
    size_t cap_  = 0;
public:
    void push_back(const T& x) {
        if (size_ == cap_) grow();
        data_[size_++] = x;
    }
private:
    void grow() {
        size_t ncap = cap_ ? cap_ * 2 : 1;
        T* nd = new T[ncap];
        for (size_t i = 0; i < size_; ++i)
            nd[i] = std::move(data_[i]);
        delete[] data_;
        data_ = nd;
        cap_  = ncap;
    }
};`,

  boot(ctx) {
    const { stage, controls, player, svgEl, fitStage } = ctx;
    const CELL = 44, GAP = 4, ROW_H = 64;

    const svg = svgEl("svg", {}, stage);
    const gOld = svgEl("g", {}, svg);   // buffer being freed during grow
    const gMain = svgEl("g", {}, svg);  // live buffer

    // visual state
    let cells = [];   // g elements of live buffer
    // shadow model (steps are generated eagerly, ahead of animation)
    let size = 0, cap = 0, values = [];
    let reallocs = 0, copies = 0;

    const stats = LabsCore.note("");
    function statText() {
      return `size=${size} cap=${cap} reallocs=${reallocs} copies=${copies}`;
    }

    function cellAt(i, y, val, cls) {
      const g = svgEl("g", { class: "vcell " + (cls || "") });
      g.setAttribute("transform", `translate(${i * (CELL + GAP)}, ${y})`);
      svgEl("rect", { width: CELL, height: CELL, rx: 6 }, g);
      if (val != null) {
        const t = svgEl("text", { x: CELL / 2, y: CELL / 2 + 5, "font-size": 14 }, g);
        t.textContent = val;
      }
      return g;
    }

    function refit(rows = 1, capacity = cap) {
      const w = Math.max(capacity, 1) * (CELL + GAP);
      const { capped } = fitStage(svg, stage, w, rows * ROW_H + CELL, 0.5);
      return capped;
    }

    function pushSteps(x) {
      const steps = [];
      if (size === cap) {
        const ncap = cap ? cap * 2 : 1;
        const oldCap = cap, oldSize = size;
        reallocs++;
        steps.push({
          line: 8,
          caption: `size_ == cap_ (${oldSize} == ${oldCap}) — buffer full, <strong>grow()</strong>`,
          run: () => {},
        });
        steps.push({
          line: 14,
          caption: `allocate new buffer, capacity <strong>${oldCap} → ${ncap}</strong>`,
          run: () => {
            // old buffer moves to top row, new ghost row appears below
            gOld.innerHTML = "";
            cells.forEach((c, i) => {
              const clone = c.cloneNode(true);
              clone.setAttribute("transform", `translate(${i * (CELL + GAP)}, 0)`);
              gOld.appendChild(clone);
            });
            gMain.innerHTML = "";
            cells = [];
            for (let i = 0; i < ncap; i++)
              cells.push(gMain.appendChild(cellAt(i, ROW_H, null, "ghost")));
            refit(2, ncap);
          },
        });
        for (let i = 0; i < oldSize; i++) {
          const v = values[i];
          steps.push({
            line: 16,
            caption: `move element [${i}] → new buffer  <strong>(${copies + i + 1} total copies)</strong>`,
            run: () => {
              gOld.children[i]?.classList.add("dying");
              const c = cells[i];
              c.classList.remove("ghost");
              c.classList.add("hot");
              const t = svgEl("text", { x: CELL / 2, y: CELL / 2 + 5, "font-size": 14 }, c);
              t.textContent = v;
              setTimeout(() => c.classList.remove("hot"), 350);
            },
          });
        }
        copies += oldSize;
        steps.push({
          line: 17,
          caption: `<strong>delete[]</strong> old buffer — the ${oldSize} old element${oldSize === 1 ? "" : "s"} are gone`,
          run: () => {
            gOld.innerHTML = "";
            cells.forEach((c, i) => {
              c.setAttribute("transform", `translate(${i * (CELL + GAP)}, 0)`);
            });
            refit(1);
            stats.textContent = statText();
          },
        });
        cap = ncap;
      }
      const idx = size;
      values.push(x);
      size++;
      steps.push({
        line: 9,
        caption: `data_[${idx}] = <strong>${x}</strong>`,
        run: () => {
          const c = cells[idx];
          c.classList.remove("ghost");
          c.classList.add("hot");
          const t = svgEl("text", { x: CELL / 2, y: CELL / 2 + 5, "font-size": 14 }, c);
          t.textContent = x;
          setTimeout(() => c.classList.remove("hot"), 350);
          const capped = refit(1);
          stats.textContent = statText() + (capped ? "  ·  zoom capped, scroll →" : "");
        },
      });
      return steps;
    }

    function reset() {
      cells = []; values = [];
      size = 0; cap = 0; reallocs = 0; copies = 0;
      gOld.innerHTML = ""; gMain.innerHTML = "";
      refit(1, 1);
      stats.textContent = statText();
      player.caption("push a value — watch <strong>size</strong> chase <strong>capacity</strong>");
    }

    const input = LabsCore.numInput("value", 7);
    controls.append(
      input,
      LabsCore.button("push_back ▸", () => {
        const v = input.value === "" ? Math.floor(Math.random() * 99) : Number(input.value);
        input.value = "";
        player.enqueue(pushSteps(v));
      }),
      LabsCore.button("push ×10", () => {
        const steps = [];
        for (let i = 0; i < 10; i++) steps.push(...pushSteps(Math.floor(Math.random() * 99)));
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
  },
});
