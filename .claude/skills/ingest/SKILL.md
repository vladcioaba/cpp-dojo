---
name: ingest
description: Ingest code-snippet screenshots from inbox/ — extract the C++ code with vision, write an LLM analysis, append to content/snippets.md, archive the image, commit and push. Use when the user says /ingest, "ingest screenshots", "process inbox", or drops screenshots to analyze.
---

# Ingest snippet screenshots

Process every image sitting in `inbox/` (png, jpg, jpeg, webp — ignore `inbox/processed/`).

For each image:

1. **Read the image** with the Read tool (vision). Extract the code exactly as shown. If the screenshot is not code, skip it and tell the user.
2. **Identify the source** if visible (LinkedIn, X/Twitter, Reddit, a book page…). If not visible, use `screenshot`.
3. **Analyze the code.** Cover, when relevant:
   - What it does / what it's really demonstrating
   - Bugs, UB, or lifetime issues — be precise about *why*
   - What a senior C++ engineer would write instead (modern C++17/20/23)
   - Which named idiom or design pattern it touches (RAII, CRTP, Observer, …)
   - If it's an interview-bait post, state the trick being tested
4. **Append a card** to `content/snippets.md` (never rewrite existing entries), following the existing format exactly:

   ```markdown
   ## snippet: YYYY-MM-DD — Source — Short punchy title
   tags: comma, separated, lowercase

   ```cpp
   <extracted code>
   ```

   **Analysis:** <paragraphs — first one starts with the bold marker as shown>
   ```

   Use today's date. Tags come from the existing vocabulary where possible (core, raii, patterns, move, templates, smart-pointers, lifetime, integer-rules, style) plus new ones when needed.
5. **Archive the image**: move it to `inbox/processed/`, prefixed with the date, e.g. `inbox/processed/2026-07-06-original-name.png`.

When all images are processed:

6. **Commit and push**: single commit, message `ingest: N snippet(s) — <short summary>`. Do NOT add a Co-Authored-By trailer.
7. **Report**: list each snippet title added and one-line verdict of its analysis.

If `inbox/` has no images, say so and stop.
