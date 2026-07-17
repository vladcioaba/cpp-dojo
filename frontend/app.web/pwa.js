/* cpp-dojo — service worker + install button + the mobile bottom nav.
   The bottom nav is a REAL flex element appended to <body> (not position:
   fixed) so taps work reliably in iOS WKWebView / the Capacitor app, where
   fixed-position bars inside an overflow:hidden flex body are flaky. */

const NAV = [
  ["today", "today.html"],
  ["feed", "index.html"],
  ["filter", "filters.html"],
  ["skills", "skills.html"],
  ["labs", "labs.html"],
  ["sprint", "sprint.html"],
  ["ranks", "ranks.html"],
];

function currentPage() {
  let p = location.pathname.replace(/^\/+/, "").replace(/\.html$/, "");
  if (p === "" || p === "index") return "index.html";
  return p + ".html";
}

function buildBottomNav() {
  if (document.querySelector(".mobilenav")) return;
  const cur = currentPage();
  const nav = document.createElement("nav");
  nav.className = "mobilenav";
  nav.setAttribute("aria-label", "primary");
  nav.innerHTML = NAV.map(([label, href]) =>
    `<a class="mnav-link${href === cur ? " active" : ""}" href="${href}"${href === cur ? ' aria-current="page"' : ""}>${label}</a>`
  ).join("");
  document.body.appendChild(nav);
}

/* mobile header = one line: "$ <current view>" (the full terminal path +
   info rows collapse into the ⚙ panel / bottom nav) */
function mobileHeader() {
  if (!matchMedia("(max-width: 640px)").matches) return;
  const cur = currentPage();
  const label = (NAV.find(n => n[1] === cur) || ["cpp-grandfather"])[0];
  const logo = document.querySelector(".topbar .logo");
  if (logo) logo.innerHTML = `<span class="view-title">${label}</span>`;
}

/* generic ≡ panel for every page that doesn't wire its own (the feed does):
   holds the page's filter strip (e.g. lab selector) + the settings row */
function buildShellPanel() {
  if (!matchMedia("(max-width: 640px)").matches) return;
  if (document.getElementById("panelBtn")) return;   // page brought its own
  const topbar = document.querySelector(".topbar");
  const stats = document.querySelector(".topbar .stats");
  const labTabs = document.getElementById("labTabs");
  if (!topbar || (!stats && !labTabs)) return;

  const btn = document.createElement("button");
  btn.className = "panel-btn";
  btn.id = "panelBtn";
  btn.setAttribute("aria-label", "filters and settings");
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "≡";
  topbar.appendChild(btn);

  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.hidden = true;
  const sheet = document.createElement("div");
  sheet.className = "filter-sheet";
  sheet.id = "filterSheet";
  document.body.prepend(sheet);
  document.body.prepend(backdrop);

  const addGroup = (label, el) => {
    if (!el) return;
    const l = document.createElement("div");
    l.className = "sheet-label";
    l.textContent = label;
    sheet.append(l, el);
  };
  if (labTabs) addGroup("labs", labTabs);
  if (stats) addGroup("settings", stats);

  const done = document.createElement("button");
  done.className = "btn btn-check sheet-apply";
  done.textContent = "done ✓";
  sheet.append(done);

  const open = o => {
    sheet.classList.toggle("open", o);
    backdrop.hidden = !o;
    btn.setAttribute("aria-expanded", String(o));
  };
  btn.onclick = () => open(!sheet.classList.contains("open"));
  backdrop.onclick = () => open(false);
  done.onclick = () => open(false);
  // picking a lab closes the panel so the stage is visible
  labTabs?.addEventListener("click", e => { if (e.target.closest(".chip")) open(false); });
}

function bootShell() { buildBottomNav(); mobileHeader(); buildShellPanel(); }
if (document.body) bootShell();
else addEventListener("DOMContentLoaded", bootShell);

/* ── service worker ──────────────────────────────────────────── */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

/* ── install button ──────────────────────────────────────────── */
let deferredPrompt = null;
addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("installBtn");
  if (btn) {
    btn.hidden = false;
    btn.onclick = async () => {
      btn.hidden = true;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    };
  }
});
addEventListener("appinstalled", () => {
  const btn = document.getElementById("installBtn");
  if (btn) btn.hidden = true;
});
