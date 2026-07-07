# cpp-dojo ⚔️

The tool to train from zero to C++ grandmaster — and for FAANG / HFT interviews. A social-feed-style daily grind (facts, quizzes, real-compiler write-drills, snippets), **LeetCode-style DS&A problems** run against an actual g++ backend, **animated algorithm/data-structure labs**, timed **sprints**, spaced repetition, accounts + a leaderboard. Web, installable PWA, and native iOS/Android from one codebase.

**Live:** https://cpp-dojo.vlad-cioaba.workers.dev — feed `/`, labs `/labs`, sprint `/sprint`, leaderboard `/ranks`

## Repo layout

```
cpp-dojo/                    ← code (this repo)
├── datasets/                ← git submodule → cpp-dojo-datasets (all content)
├── frontend/
│   ├── app.web/             ← the web app (Cloudflare Worker static assets)
│   ├── app.ios/             ← Capacitor iOS (Xcode)
│   └── app.android/         ← Capacitor Android
├── backend/
│   ├── src/worker.js        ← Worker: content proxy, /api/run, auth, leaderboard
│   └── container/           ← g++ compile sandbox (Cloudflare Containers)
└── wrangler.jsonc
```

Content lives in a **separate repo** ([cpp-dojo-datasets](https://github.com/vladcioaba/cpp-dojo-datasets)), added here as a submodule — one card per file under `{topic}/{NN}_{headline}_{level}.md`, concatenated into `bundle.md`.

## Architecture

- **Content — separate repo, loaded from GitHub.** The backend serves `GET /content/bundle.md` by proxying the datasets repo's GitHub raw (edge-cached 5 min), so the browser loads one same-origin file and content updates without redeploying the app.
- **App — Cloudflare Worker static assets** (`frontend/app.web`, no build step).
- **Compile service — Docker container on Cloudflare Containers** (`backend/container`): alpine + g++, a hardened Python sandbox (unprivileged, per-run process reaping, fork-bomb cap, rate-limited). `POST /api/run {code}` → compile `g++ -std=c++20`, run, return JSON.
- **Drills & challenges really compile.** Each carries a hidden `// harness` — a full program with `//__USER__` where your code injects, plus runtime checks that print `PASS`. The whole FAANG bank (27 problems) is compile-verified.
- **Leaderboard + accounts — Durable Object with SQLite** (`/ranks`): sign up (nickname + email + password, PBKDF2-hashed) or play anonymously; XP/streak sync from the feed.
- **Spaced repetition.** Missed quizzes/challenges resurface on an SM-2 schedule via the **review** filter.
- **Native apps** — Capacitor shells in `frontend/app.{ios,android}` load the live site (`server.url`), so one deploy updates everything.

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
| order book | price-time-priority limit book + matching engine; submit crossing orders, watch partial/full fills |
| verilog | sequential-logic waveform sim — pick a circuit (D-FF, counter, shift reg, T-FF), step the clock, watch the timing diagram; teaches non-blocking `<=` |
| market maker | P&L sim: random-walk mid, you quote a spread, flow fills you — spread capture vs adverse selection vs inventory risk, live charts |

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

## Install / mobile / iOS

The app is an installable **PWA** — one web codebase delivered everywhere:

- **Any browser** (desktop / tablet / phone): just open the URL.
- **Install to home screen / dock**: an "install" button appears where supported (Chrome, Edge, Android); on iOS Safari use Share → Add to Home Screen. Installed, it runs full-screen with an app icon and works offline for the shell (service worker in `public/sw.js` caches the app; `/api/*` and content always hit the network).
- **Native iOS / Android app** (App Store / Play): wrapped with Capacitor in `mobile/` — reuses 100% of the web app. See `mobile/README.md`. The iOS build needs your Mac + Xcode + an Apple Developer account (signing/enrollment are your steps).

## Content format

One card per `##` section:

| File | Card | Format |
|------|------|--------|
| `facts.md` | fact | `## fact: Title`, prose + ```cpp blocks |
| `quizzes.md` | quiz | `## quiz: Question`, code, `- [ ]`/`- [x]` options, `> explanation` |
| `exercises.md` | drill | prompt, `// starter` block, solution block, `// harness` block (hidden; `//__USER__` marker, prints `PASS`) |
| `challenges.md` | challenge | timed drill: prompt, `// starter`, solution, `// harness`; tagged `track: hft` |
| `snippets.md` | snippet | `## snippet: date — source — title`, code, `**Analysis:**` |

Cards may carry `track: hft` (default `core`). The **⚡ HFT prep** header toggle restricts the whole feed to `track: hft` cards.

## Sprint (`/sprint`) — timed drills

Beat the clock, mock-interview style:
- **Arithmetic sprint** — generated mental-math (Optiver-style), easy/medium/hard, numeric input, best time saved.
- **Quiz round** — N random cards from a chosen track (HFT C++ / quant / FPGA / core), timed, scored, with explanations.

## Prep tracks

The feed's track toggle cycles **all → ⚡ HFT C++ → 📊 quant → 🔧 FPGA**; sprint and the toggle draw from the same tagged content.

- **HFT low-latency C++** — 56 cards (26 facts, 22 quizzes, 8 timed challenges): cache lines / false sharing, `memory_order`, lock-free / CAS / ABA, branch prediction, RVO, `noexcept`, UB + aliasing, `rdtsc` + tail percentiles, huge pages / TLB, NUMA.
- **Quant** — 26 probability / EV / combinatorics / market-making brainteasers (Optiver, Jane Street, IMC): coupon collector, gambler's ruin, Bayes, order statistics, fair odds.
- **FPGA for HFT** — 42 cards (24 facts, 18 quizzes): LUTs/FFs/BRAM/DSP, Verilog (blocking vs non-blocking), timing closure / Fmax, pipelining, CDC + metastability, HLS, tick-to-trade in nanoseconds.

Toggle **⚡ HFT prep** to focus the feed on low-latency C++ — interview-grade cards for firms like Optiver, IMC, Jump, HRT, Citadel Securities:

- **26 facts + 22 quizzes** — cache lines / false sharing, the C++ memory model (`memory_order`), lock-free / CAS / ABA, branch prediction, RVO + guaranteed copy elision, `noexcept` moves, UB + strict aliasing, `rdtsc` + tail percentiles, huge pages / TLB, NUMA, `volatile` ≠ `atomic`.
- **8 challenges** — timed, compile-checked: SPSC ring buffer, fixed object pool, branchless min, round-up-to-power-of-two, `bit_cast` float punning, O(1) swap-remove, `popcount`, cache-line-padded counter. The clock starts on your first keystroke; best time is saved.

Keys: `j`/`k` jump between feed cards. Feed order reshuffles deterministically each day.

## Deploy

```bash
npx wrangler deploy     # builds + pushes the container image too (needs Docker)
```

## Roadmap

- Leveled curriculum: novice → grandmaster, XP-gated
- Spaced repetition of failed cards
- More labs: hash map open addressing, B-tree, LRU cache
- Ship the Capacitor iOS/Android builds to the stores
