# Snippets

One page, every captured snippet. Appended by the `/ingest` skill from screenshots dropped in `inbox/`, newest at the bottom. Card format: `## snippet: YYYY-MM-DD — Source — Title`, `tags:` line, ```cpp block, then `**Analysis:**` paragraphs.

## snippet: 2026-07-06 — seed — The interview classic that leaks
tags: smart-pointers, seed

```cpp
struct Cache {
    std::shared_ptr<Cache> parent;
    std::vector<std::shared_ptr<Cache>> children;
    void add(std::shared_ptr<Cache> c) {
        c->parent = shared_from_this();   // requires enable_shared_from_this
        children.push_back(std::move(c));
    }
};
```

**Analysis:** Parent owns children, children own parent — every parent/child pair forms a reference cycle, so the whole tree leaks when the last external `shared_ptr` drops. As written it's also UB: `shared_from_this()` requires inheriting `std::enable_shared_from_this<Cache>` *and* the object already being managed by a `shared_ptr`.

Fix: `std::weak_ptr<Cache> parent;` — children observe the parent, ownership flows one way (down). This exact shape shows up in GUI widget trees, scene graphs, and DOM-like structures.

## snippet: 2026-07-06 — seed — "Look ma, no branches"
tags: core, style

```cpp
bool is_even(int n) {
    return n % 2 == 0 ? true : false;
}
```

**Analysis:** The viral "spot the smell" post. `x ? true : false` is a no-op on something already `bool` — `return n % 2 == 0;` says the same thing. Harmless here, but the pattern signals the author thinks of booleans as things to *produce with an if* rather than values to compute. Watch for its cousins: `if (cond) return true; else return false;` and `== true` comparisons.

## snippet: 2026-07-06 — seed — The loop that never ends
tags: core, integer-rules

```cpp
std::vector<int> v = {1, 2, 3};
for (unsigned i = v.size() - 1; i >= 0; --i)
    std::cout << v[i];
```

**Analysis:** `i` is unsigned, so `i >= 0` is always true — after `i` hits 0, `--i` wraps to `4294967295` and `v[i]` is out-of-bounds UB. Also `v.size() - 1` on an *empty* vector wraps the same way before the loop even starts.

Fixes, best first: iterate forward with a range-for over `std::views::reverse(v)` (C++20); classic index loop with `for (auto i = v.size(); i-- > 0;)` (the "goes-to operator" `i --> 0`); or use a signed `int`/`ptrdiff_t` index. Signed/unsigned wraparound is the most reposted C++ gotcha on LinkedIn for a reason.
