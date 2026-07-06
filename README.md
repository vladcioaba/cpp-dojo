# cpp-dojo ⚔️

Daily C++ grind, shaped like a social feed. Open it every morning, scroll cards one at a time: **facts**, **quizzes**, **write-the-code drills** (Duolingo-style), and **snippets** captured from LinkedIn & co. with LLM analysis. Streak + XP tracked locally.

## Run

Hosted: GitHub Pages serves `index.html` from `main`.

Local:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(Direct `file://` open won't work — content is fetched, browsers block that.)

## Capture snippets from social media

1. Screenshot the code post (LinkedIn, X, Reddit…).
2. Drop the image into `inbox/`.
3. In Claude Code, run `/ingest`.

Claude extracts the code, writes an analysis (bugs, UB, the modern way, which pattern it touches), appends a card to `content/snippets.md` — the single page holding every snippet ever captured — archives the image to `inbox/processed/`, commits and pushes. Next morning it's in the feed.

## Content

All cards are plain markdown in `content/`, one card per `##` section:

| File | Card | Format |
|------|------|--------|
| `facts.md` | fact | `## fact: Title`, prose + ```cpp blocks |
| `quizzes.md` | quiz | `## quiz: Question`, code, `- [ ]`/`- [x]` options, `> explanation` |
| `exercises.md` | write drill | `## exercise: Title`, prompt, optional `// starter` block, last ```cpp block = solution |
| `snippets.md` | snippet | `## snippet: date — source — title`, code, `**Analysis:**` |

Answer checking ignores whitespace and comments, so drills tell you exact names to use. Feed order reshuffles deterministically each day. Progress (streak, XP, solved cards) lives in `localStorage`.

Keys: `j`/`k` to jump between cards.

## Roadmap

- Leveled curriculum track: novice → grandmaster, gated by XP
- Spaced repetition: resurface failed quizzes/drills
- More content: move semantics deep-dive, concurrency, C++20 ranges/concepts
