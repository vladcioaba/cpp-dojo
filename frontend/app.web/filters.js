/* cpp-grandfather — the filter tab. One place for every feed filter plus
   stats/theme. Choices persist in localStorage; the feed reads them at boot. */

const TYPES = [
  { id: "all", label: "all" },
  { id: "fact", label: "facts" },
  { id: "quiz", label: "quiz" },
  { id: "exercise", label: "write" },
  { id: "challenge", label: "challenges" },
  { id: "snippet", label: "snippets" },
  { id: "review", label: "review" },
];
const TRACKS = [
  { id: "all", label: "◆ all tracks" },
  { id: "cpp", label: "⚙ C++" },
  { id: "python", label: "🐍 Python" },
  { id: "fpga", label: "🔧 FPGA" },
  { id: "quant", label: "📊 quant" },
  { id: "faang", label: "💼 FAANG" },
  { id: "hft", label: "⚡ HFT C++" },
  { id: "design", label: "🏛 design" },
];
const DIFFS = [
  { id: "all", label: "◇ any level" },
  { id: "easy", label: "● easy" },
  { id: "medium", label: "● medium" },
  { id: "hard", label: "● hard" },
];

const KEYS = { type: "cppdojo-typefilter", track: "cppdojo-track", diff: "cppdojo-diff" };
const sel = {
  type: localStorage.getItem(KEYS.type) || "all",
  track: localStorage.getItem(KEYS.track) || "all",
  diff: localStorage.getItem(KEYS.diff) || "all",
};

function renderGroup(elId, items, key) {
  const el = document.getElementById(elId);
  el.innerHTML = items.map(it =>
    `<button class="chip${sel[key] === it.id ? " active" : ""}" data-id="${it.id}" aria-pressed="${sel[key] === it.id}">${it.label}</button>`).join("");
  el.addEventListener("click", e => {
    const c = e.target.closest(".chip");
    if (!c) return;
    sel[key] = c.dataset.id;
    localStorage.setItem(KEYS[key], sel[key]);
    el.querySelectorAll(".chip").forEach(x => {
      x.classList.toggle("active", x === c);
      x.setAttribute("aria-pressed", x === c);
    });
  });
}

renderGroup("typeChips", TYPES, "type");
renderGroup("trackChips", TRACKS, "track");
renderGroup("diffChips", DIFFS, "diff");

document.getElementById("applyBtn").onclick = () => { location.href = "index.html"; };
document.getElementById("resetBtn").onclick = () => {
  for (const k of Object.keys(KEYS)) { sel[k] = "all"; localStorage.setItem(KEYS[k], "all"); }
  renderGroup("typeChips", TYPES, "type");
  renderGroup("trackChips", TRACKS, "track");
  renderGroup("diffChips", DIFFS, "diff");
};

/* stats from the shared game state */
try {
  const st = JSON.parse(localStorage.getItem("cppdojo") || "{}");
  document.getElementById("streak").textContent = st.streak || 0;
  document.getElementById("xp").textContent = st.xp || 0;
} catch { /* fresh device */ }

/* on phones the header stats strip is hidden — theme lives here instead */
if (matchMedia("(max-width: 640px)").matches) {
  const t = document.getElementById("themeToggle");
  if (t) document.querySelector(".flt-stats")?.appendChild(t);
}
