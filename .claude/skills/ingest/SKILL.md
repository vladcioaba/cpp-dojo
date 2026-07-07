---
name: ingest
description: Ingest code-snippet screenshots from inbox/ — extract the C++ code with vision, write an LLM analysis, add it as a new card in the datasets submodule, rebuild the bundle, commit and push both repos. Use when the user says /ingest, "ingest screenshots", "process inbox", or drops screenshots to analyze.
---

# Ingest snippet screenshots

Content now lives in the **datasets submodule** at `datasets/` (repo `vladcioaba/cpp-dojo-datasets`). Snippets are one-card-per-file under `datasets/snippets/`.

Process every image in `inbox/` (png, jpg, jpeg, webp — ignore `inbox/processed/`).

For each image:

1. **Read the image** with the Read tool (vision). Extract the code exactly as shown. If it is not code, skip it and tell the user.
2. **Identify the source** if visible (LinkedIn, X/Twitter, Reddit, a book…). If not, use `screenshot`.
3. **Analyze the code** — what it does, bugs / UB / lifetime issues (and why), the modern C++ way, which named idiom or pattern it touches, and any interview-bait trick.
4. **Add a new card file** in `datasets/snippets/`. Find the highest existing `NN_` prefix and use the next number. Name it `NN_<short-slug>_snippet.md`. Contents follow the snippet card format exactly:

   ```markdown
   ## snippet: YYYY-MM-DD — Source — Short punchy title
   tags: comma, separated, lowercase

   ```cpp
   <extracted code>
   ```

   **Analysis:** <paragraphs — first begins with the bold marker>
   ```

   Use today's date.
5. **Rebuild the bundle**: `cd datasets && node tools/build.js` (regenerates `bundle.md` + `manifest.json`).
6. **Archive the image**: move it to `inbox/processed/`, date-prefixed (e.g. `inbox/processed/2026-07-07-name.png`).

When all images are processed:

7. **Commit + push the datasets repo**: `cd datasets && git add -A && git commit -m "ingest: N snippet(s) — <summary>" && git push`. The live app serves the bundle from this repo's GitHub raw, so the new snippet appears without redeploying the app. Do NOT add a Co-Authored-By trailer.
8. **Update the submodule pointer in the code repo**: from the repo root, `git add datasets && git commit -m "chore: bump datasets" && git push` (records the new datasets commit).
9. **Report**: list each snippet title added and a one-line verdict.

If `inbox/` has no images, say so and stop.
