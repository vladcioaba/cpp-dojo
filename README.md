# cpp-dojo ⚔️

Daily C++ grind, shaped like a social feed. Open it every morning, scroll cards one at a time: **facts**, **quizzes**, **write-the-code drills** with a *real compiler* behind the check button, **snippets** captured from LinkedIn & co. with LLM analysis — plus **animated visualization labs** for the classic data structures. Streak + XP tracked locally. Day/night theme.

**Live:** https://cpp-dojo.vlad-cioaba.workers.dev — feed at `/`, labs at `/labs`

## Architecture

- **Content database — open on GitHub (this repo).** All cards are markdown in `content/`; the app fetches them from `raw.githubusercontent.com` at load, so pushing a content change updates the live site without a redeploy. `content/snippets.md` is the single page holding every captured snippet.
- **App — Cloudflare Worker static assets** (`public/`, no build step).
- **Compile service — Docker container on Cloudflare Containers** (`container/`): alpine + g++, a small Python server. `POST /api/run {code}` → compile with `g++ -std=c++20`, run with rlimits + timeouts, return JSON. The Worker (`src/worker.js`) routes `/api/run` to the container (Durable Object, auto-sleeps after 15 min idle).
- **Drills really compile.** Each exercise in `content/exercises.md` carries a hidden `// harness` block — a full program with `//__USER__` where your typed code injects, plus runtime checks that print `PASS`. Backend unreachable → falls back to normalized string match.

## Labs (`/labs`)

Animated, step-by-step, each with the C++ implementation alongside — the executing line highlights as the animation plays. Transport controls: play/pause, single-step, speed, reset.

| Lab | What you watch |
|-----|----------------|
| vector | `push_back` filling capacity, then grow(): allocate ×2, copy elements over, free old buffer. Zooms out as it grows, caps, then scrolls |
| heap | array and implicit tree side by side — sift-up on push, sift-down on pop, Floyd's build-heap |
| seg tree | bottom-up build (`node = left + right`), range queries touching only O(log n) nodes |
| bst | insert/find walking the compare path; "worst case" button shows sorted input degenerating to a list |
| rb tree | insert fixup live: red uncle → recolor; black uncle → rotation — nodes glide into balance. Sorted 1..15 stays log-height |
| graph | BFS ring vs DFS dive vs A* beeline on a wall-drawing grid |

## Run locally

```bash
npm install
npx wrangler dev        # full stack incl. container (needs Docker)
# or static-only, no compile backend:
python3 -m http.server 8000   # → http://localhost:8000/public/
```

## Capture snippets from social media

1. Screenshot the code post (LinkedIn, X, Reddit…).
2. Drop the image into `inbox/`.
3. Run `/ingest` in Claude Code inside this repo.

Code gets extracted (vision), analyzed (bugs, UB, the modern way, which pattern), appended to `content/snippets.md`, committed and pushed — in the feed by next morning, no redeploy needed.

## Content format

One card per `##` section:

| File | Card | Format |
|------|------|--------|
| `facts.md` | fact | `## fact: Title`, prose + ```cpp blocks |
| `quizzes.md` | quiz | `## quiz: Question`, code, `- [ ]`/`- [x]` options, `> explanation` |
| `exercises.md` | drill | prompt, `// starter` block, solution block, `// harness` block (hidden; `//__USER__` marker, prints `PASS`) |
| `snippets.md` | snippet | `## snippet: date — source — title`, code, `**Analysis:**` |

Keys: `j`/`k` jump between feed cards. Feed order reshuffles deterministically each day.

## Deploy

```bash
npx wrangler deploy     # builds + pushes the container image too (needs Docker)
```

## Roadmap

- Leveled curriculum: novice → grandmaster, XP-gated
- Spaced repetition of failed cards
- More labs: hash map open addressing, B-tree, LRU cache
