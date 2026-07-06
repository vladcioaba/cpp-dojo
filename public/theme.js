/* cpp-dojo — day/night. Runs before paint; toggle via #themeToggle. */
(function () {
  const KEY = "cppdojo-theme";
  function resolve() {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function apply(t) {
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = t === "dark" ? "☀" : "☾";
  }
  apply(resolve());
  window.toggleTheme = function () {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply(next);
  };
  addEventListener("DOMContentLoaded", () => {
    apply(resolve());
    const btn = document.getElementById("themeToggle");
    if (btn) btn.onclick = window.toggleTheme;
  });
})();
