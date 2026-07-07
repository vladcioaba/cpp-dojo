/* cpp-dojo — shared C++ syntax highlighter + markdown inline. Global: window.CPP */
(function () {
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  const KW = new RegExp("\\b(" + (
    "alignas alignof auto bool break case catch char char8_t char16_t char32_t class concept const " +
    "consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default " +
    "delete do double dynamic_cast else enum explicit export extern false final float for friend goto " +
    "if inline int long mutable namespace new noexcept nullptr operator override private protected " +
    "public reinterpret_cast requires return short signed sizeof static static_assert static_cast " +
    "struct switch template this thread_local throw true try typedef typeid typename union unsigned " +
    "using virtual void volatile wchar_t while"
  ).trim().split(/\s+/).join("|") + ")\\b", "g");

  const TYPES = /\b(std|string_view|string|vector|map|set|queue|stack|pair|array|unique_ptr|shared_ptr|weak_ptr|enable_shared_from_this|function|variant|optional|mutex|lock_guard|jthread|fstream|FILE|size_t|ptrdiff_t|chrono|steady_clock|time_point|milliseconds|duration_cast|cout|cin|endl|make_unique|make_shared|move|visit|sort|swap|views|reverse|less|greater|is_integral_v|priority_queue|numeric_limits|min|max)\b/g;

  const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#[^\n]*)/gm;

  function plain(s) {
    return esc(s)
      .replace(KW, '<span class="tk-k">$1</span>')
      .replace(TYPES, '<span class="tk-t">$1</span>')
      .replace(/\b(\d[\d.'xXbBa-fA-F]*)\b/g, '<span class="tk-n">$1</span>');
  }

  function highlight(code) {
    let out = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(code))) {
      out += plain(code.slice(last, m.index));
      if (m[1]) out += `<span class="tk-c">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tk-s">${esc(m[2])}</span>`;
      else out += `<span class="tk-p">${esc(m[3])}</span>`;
      last = m.index + m[0].length;
    }
    out += plain(code.slice(last));
    return out;
  }

  /* Code block with line-number gutter. withLineSpans: wrap each line in
     <span class="cl" data-l="n"> so labs can highlight the executing line. */
  function codeBlock(code, withLineSpans) {
    const lines = code.split("\n");
    const gutter = lines.map((_, i) => i + 1).join("\n");
    let body;
    if (withLineSpans) {
      body = highlightPerLine(code)
        .map((h, i) => `<span class="cl" data-l="${i + 1}">${h}\n</span>`)
        .join("");
    } else {
      body = highlight(code);
    }
    return `<div class="code"><div class="gutter">${gutter}</div><pre>${body}</pre></div>`;
  }

  /* Highlight line-by-line so spans never cross line boundaries (needed for
     per-line wrapping). Multi-line block comments are re-detected per line. */
  function highlightPerLine(code) {
    const lines = code.split("\n");
    const out = [];
    let inComment = false;
    for (const line of lines) {
      if (inComment) {
        const end = line.indexOf("*/");
        if (end === -1) { out.push(`<span class="tk-c">${esc(line)}</span>`); continue; }
        out.push(`<span class="tk-c">${esc(line.slice(0, end + 2))}</span>` + highlight(line.slice(end + 2)));
        inComment = false;
        continue;
      }
      const open = line.match(/\/\*(?![\s\S]*\*\/)/);
      if (open) inComment = true;
      out.push(highlight(line));
    }
    return out;
  }

  window.CPP = { esc, inline, highlight, codeBlock };
})();
