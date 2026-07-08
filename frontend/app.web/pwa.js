/* cpp-dojo — service worker + install button + the mobile bottom nav.
   The bottom nav is a REAL flex element appended to <body> (not position:
   fixed) so taps work reliably in iOS WKWebView / the Capacitor app, where
   fixed-position bars inside an overflow:hidden flex body are flaky. */

const NAV = [
  ["today", "today.html"],
  ["feed", "index.html"],
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

if (document.body) buildBottomNav();
else addEventListener("DOMContentLoaded", buildBottomNav);

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
