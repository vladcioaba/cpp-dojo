# HFT Facts

Card format: a fact heading, a `tags:` line, a `track: hft` line, body markdown, optional ```cpp block. Every card carries `track: hft` to drive the low-latency study filter.

## fact: The memory hierarchy is the whole game
tags: cache, memory, latency
track: hft

Modern x86-64 moves memory in **64-byte cache lines**, never single bytes. Access latencies span orders of magnitude: **L1 ~1 ns (~4 cycles)**, **L2 ~3-4 ns (~12 cycles)**, **L3 ~10-20 ns (~40 cycles)**, **DRAM ~60-100 ns (hundreds of cycles)**. One L1→DRAM miss can cost ~100 ns — time enough to retire hundreds of instructions.

Design for **spatial locality** (touch bytes that share a line) and **temporal locality** (reuse hot data before it's evicted). Struct-of-arrays often beats array-of-structs because you only pull the fields you iterate over into cache.

The hardware prefetcher detects sequential/strided access and fetches lines ahead of use, which is why linear scans over `std::vector` fly. For irregular access you can hint with `__builtin_prefetch(ptr)` (or `_mm_prefetch`), but measure — a bad prefetch wastes bandwidth and evicts useful lines.

## fact: False sharing — two threads, one cache line
tags: cache, concurrency, false-sharing
track: hft

Two threads writing **different variables that happen to share one 64-byte line** still contend: each write invalidates the line in the other core's cache (MESI), forcing a coherence round-trip. Throughput collapses even though the variables are logically independent.

Fix by aligning hot per-thread data onto its own line with `alignas(std::hardware_destructive_interference_size)` (typically 64 on x86-64; some implementations use 128 to account for adjacent-line prefetch).

```cpp
struct alignas(std::hardware_destructive_interference_size) Counter {
    std::atomic<std::uint64_t> value{0};
};
Counter a, b; // a and b never land on the same cache line
```

The dual constant `std::hardware_constructive_interference_size` tells you the max size to *pack together* on purpose.

## fact: Branch mispredictions flush the pipeline
tags: branch-prediction, pipeline, branchless
track: hft

Deep out-of-order pipelines speculate past every branch. A correctly predicted branch is nearly free; a **misprediction flushes the pipeline for ~15-20 cycles** on modern x86. Predictable branches (a bounds check that almost never fires) are cheap; data-dependent, ~50/50 branches are the killers.

`[[likely]]`/`[[unlikely]]` (C++20) hint the compiler which side is hot to improve code layout, but they don't override the hardware predictor and are easy to misuse — profile first.

When a branch is inherently unpredictable, go **branchless** so there's nothing to mispredict — the compiler lowers a ternary to a conditional move (`cmov`), or you mask arithmetically:

```cpp
int m = (a > b) ? a : b;             // compiler emits cmov — no branch
std::uint64_t mask = -std::uint64_t(cond); // cond is 0/1 -> 0x0 or 0xFFFF...F
sum += x & mask;                     // adds x iff cond, no branch
```

Branchless isn't always a win — a `cmov` carries a data dependency and can't be speculated past — so measure.

## fact: memory_order — pay only for the ordering you need
tags: atomics, memory-model, concurrency
track: hft

`std::atomic` ops take a memory order controlling compiler *and* CPU reordering:

- `relaxed` — atomicity only, no ordering. Cheapest; correct for independent counters/stats where you publish no other data.
- `acquire` (loads) / `release` (stores) — a release store *publishes* all prior writes; a matching acquire load that reads that value *sees* them. The standard producer→consumer handshake.
- `seq_cst` (the default) — a single global total order over all seq_cst ops. Easiest to reason about, but costs more.

On x86 (TSO), plain loads are already acquire and plain stores already release, so `acquire`/`release` are nearly free there; the cost of `seq_cst` is on the **store** side, which compiles to `XCHG` or `MOV;MFENCE` to drain the store buffer. On weakly-ordered ARM the differences are larger (explicit barriers). Rule: `relaxed` for counters, `acquire`/`release` to hand off data, `seq_cst` only when you truly need one global order.

## fact: Blocking vs lock-free vs wait-free
tags: concurrency, lock-free, wait-free
track: hft

These describe **progress guarantees**, not merely "no mutex":

- **Blocking**: a thread can be stalled indefinitely by another. If a mutex holder is descheduled, everyone waits — priority inversion and unbounded latency, which is what HFT fears.
- **Lock-free**: the system as a whole always progresses — at least one thread completes in a bounded number of steps — but an individual thread can starve (a CAS loop that keeps retrying).
- **Wait-free**: *every* thread completes in a bounded number of *its own* steps regardless of others. Strongest guarantee, hardest to build; gives the tightest worst-case (tail) latency.

The HFT appeal is bounded tail latency and immunity to a descheduled thread stalling the pipeline — not raw throughput. Lock-free is not automatically faster than a well-used mutex; it's about the worst case, not the average.

## fact: compare_exchange and the ABA problem
tags: cas, lock-free, aba
track: hft

**CAS** underlies most lock-free code: `compare_exchange_strong(expected, desired)` atomically writes `desired` only if the value still equals `expected`, else reloads `expected`. Algorithms spin on this. Use `_weak` inside loops (may fail spuriously but cheaper on LL/SC machines); `_strong` when you don't already loop.

The **ABA problem**: a thread reads A, another changes it A→B→A, and the first thread's CAS succeeds because the value *looks* unchanged — even though the world moved (e.g. a freed-and-recycled node). Classic in lock-free stacks/queues with pointer reuse.

Fixes: a **tagged pointer / version counter** (pack a monotonic tag beside the pointer so "A with tag 1" ≠ "A with tag 2", often via double-width `cmpxchg16b`), **hazard pointers**, or **epoch-based reclamation** to stop memory being recycled underneath a reader.

## fact: The SPSC ring buffer, the HFT workhorse
tags: spsc, ring-buffer, lock-free
track: hft

A single-producer/single-consumer ring buffer needs **no locks and no CAS**: only one thread writes `head`, only one writes `tail`. Correctness comes purely from **release/acquire pairing** — the producer fills the slot, then release-stores the new head; the consumer acquire-loads head and is guaranteed to see the slot's data.

Keep `head` and `tail` on **separate cache lines** or the producer and consumer false-share the control indices. Size a power of two so wrap is a mask, not a modulo. Each side caches the other's index to avoid re-reading the contended atomic every iteration.

```cpp
alignas(64) std::atomic<size_t> head{0}; // written by producer only
alignas(64) std::atomic<size_t> tail{0}; // written by consumer only
// producer: buf[h & mask] = x; head.store(h + 1, std::memory_order_release);
// consumer: if (t != head.load(std::memory_order_acquire)) {
//               x = buf[t & mask]; tail.store(t + 1, std::memory_order_release); }
```

## fact: Exceptions — zero-cost until you throw
tags: exceptions, hot-path, rtti
track: hft

Modern C++ uses **table-based ("zero-cost") exceptions**: the happy path has no per-call setup, so `try` blocks don't slow normal execution. The cost is the **throw**: unwinding walks tables, runs destructors, and can take microseconds — an eternity on the hot path, and non-deterministic.

HFT keeps throwing out of the trading loop: error codes, `std::optional`/`std::expected`, or `[[noreturn]]` fatal handlers. Throwing is fine for startup/config errors that happen once. The related trap: exception tables and **RTTI** (`dynamic_cast`, `typeid`) add binary size and hurt I-cache locality, which is why some shops build the hot library with `-fno-exceptions -fno-rtti`.

## fact: malloc is a latency landmine
tags: allocation, hot-path, memory
track: hft

`new`/`malloc` can take a lock (glibc arenas), walk a free-list, fault in a fresh page, or drop into the kernel (`mmap`/`brk`) — latency from tens of nanoseconds to microseconds, with an unbounded tail. Unacceptable on the hot path.

Techniques: **preallocate** everything at startup; use **object pools**/free-lists, **arena/bump allocators**, and fixed-capacity containers (`reserve()` up front, `std::array`, ring buffers). `std::pmr` (`monotonic_buffer_resource`) lets standard containers draw from a preallocated buffer. The goal is **zero allocation in steady state** — allocate before the open, never during.

## fact: Virtual calls cost more than the indirection
tags: virtual, vtable, inlining
track: hft

A virtual call adds a load (fetch the vtable pointer, then the function pointer) and an indirect branch the CPU may mispredict. But the bigger cost is what it **prevents**: the compiler usually can't see the target, so it **can't inline**, blocking constant propagation, vectorization, and cross-call optimization.

Hot-path alternatives: **CRTP** (static polymorphism), templates, `std::variant` + `std::visit`, or a plain `switch` on a type tag. If you must dispatch dynamically, keeping the same type in a tight loop lets the indirect-branch predictor learn it, and `final` can let the compiler **devirtualize** when the dynamic type is provable.

## fact: shared_ptr's refcount is atomic — and not free
tags: shared-ptr, atomics, memory
track: hft

Copying a `std::shared_ptr` does an **atomic** increment of the control block's refcount; destroying one does an atomic decrement (with acquire/release ordering so the last owner deletes safely). Those atomic read-modify-writes are far pricier than a pointer copy, and if multiple threads touch the same control block they **contend** on that cache line.

On the hot path: pass `const shared_ptr&` or a raw/`T*` observer instead of copying; prefer `unique_ptr` (no refcount) or value semantics; don't churn shared_ptrs in a loop. Also, object and control block are two allocations unless you use `make_shared`, adding a pointer-chase. `weak_ptr::lock()` is atomic too. `shared_ptr` is a fine ownership tool — just not something to copy on every tick.

## fact: Copy elision makes return-by-value free
tags: rvo, copy-elision, cpp17
track: hft

Returning a local or temporary by value doesn't copy or move when elision applies — the object is built directly in the caller's storage. Since **C++17, copy elision is guaranteed** for returning a prvalue (`return T{...};`), even if the copy/move constructor is deleted. **NRVO** (returning a named local, `return x;`) is still only *permitted*, not mandated — but every serious compiler does it.

So `T make() { return T{...}; }` is genuinely zero-cost; you need no out-parameter and no `std::move` on the return. In fact `return std::move(local);` **pessimizes** — it forces a move and disables NRVO because it's no longer the plain named-return form. Return the name directly.

## fact: noexcept isn't a comment — it changes codegen
tags: noexcept, move, performance
track: hft

`noexcept` lets the optimizer skip unwinding paths around a call and is a **precondition for library fast paths**. The canonical case is `std::vector` growth: on reallocation it **moves** elements only if the move constructor is `noexcept`; otherwise it **copies**, to preserve the strong exception guarantee. A non-`noexcept` move ctor silently turns O(n) moves into O(n) copies on every regrowth.

`std::move_if_noexcept` and many `std::` operations branch on this. Mark move constructor, move assignment, and `swap` `noexcept` (destructors are `noexcept` by default). If a `noexcept` function does throw, `std::terminate` runs — so promise it only when true.

## fact: UB is a promise the optimizer holds you to
tags: undefined-behavior, optimizer, aliasing
track: hft

The optimizer assumes UB **never happens** and transforms accordingly. Two big ones:

**Signed integer overflow is UB**, so the compiler assumes `x + 1 > x` always holds — it promotes loop counters, drops checks, and hoists code. This is usually a *win* (part of why `int` loop counters vectorize better than `unsigned`, which is defined to wrap). But relying on signed wraparound is a bug; use unsigned or `-fwrapv` for true modular arithmetic.

**Strict aliasing**: the compiler assumes pointers of *different* types don't alias (except `char*`), so it keeps values in registers across writes through an unrelated pointer. Reading a `float` through an `int*` therefore breaks at `-O2` — which is exactly why `reinterpret_cast` type-punning is UB.

## fact: Type-pun with bit_cast/memcpy, never reinterpret_cast
tags: type-punning, bit-cast, aliasing, restrict
track: hft

Reading a `float`'s bytes via `*reinterpret_cast<int*>(&f)` violates **strict aliasing** and is undefined — the optimizer may assume the two never alias and reorder or elide your load. The correct, zero-cost tools:

```cpp
float f = 1.0f;
int i = std::bit_cast<int>(f);        // C++20, constexpr, sizes must match
int j; std::memcpy(&j, &f, sizeof j); // pre-C++20; folded to a register move
```

`std::bit_cast`/`memcpy` say "reinterpret these bytes" without lying to the aliasing analysis, and compilers lower them to a plain move — no actual copy. Conversely, when you *promise* pointers don't overlap, `restrict` (`__restrict` in C++) lets the compiler drop reload/aliasing guards and vectorize — but a false `restrict` promise is itself UB.

## fact: Measure cycles with rdtscp, not high_resolution_clock
tags: measurement, rdtsc, benchmarking
track: hft

For nanosecond timing, read the CPU timestamp counter with **`rdtsc`/`rdtscp`**. Plain `rdtsc` can be reordered by out-of-order execution, so you fence it: `lfence; rdtsc`, or `rdtscp` (which waits for prior instructions to retire) plus `lfence`. `rdtscp` also returns the core id so you can detect a mid-measurement migration.

`std::chrono::high_resolution_clock` is convenient but coarser and, on some implementations, just an alias for `system_clock` (subject to NTP/wall-clock jumps) — prefer `steady_clock` for durations. Its resolution and call overhead exceed a fenced TSC read.

Caveat: on modern **invariant-TSC** CPUs the counter ticks at a *constant reference rate* (unaffected by frequency scaling), so convert ticks→ns with the TSC frequency, not the current core clock. Pin the thread — TSC values are only comparable on the same core.

## fact: Report p99/p99.9, never the mean
tags: latency, percentiles, tail
track: hft

Latency distributions are heavy-tailed, so the **mean misleads** — a few multi-microsecond stalls (page fault, context switch, cache-miss storm) hide behind a low average. HFT tracks the **tail**: p50, p99, p99.9, and the max, because the trade you lose is the slow one.

Measure with a histogram (e.g. HdrHistogram) rather than storing every sample, and beware **coordinated omission** — a load generator that pauses while the system is stalled undercounts exactly the slow requests you care about. Optimizing the mean while p99.9 balloons is the classic beginner mistake; interviewers want to hear "tail latency."

## fact: Huge pages cut TLB misses
tags: tlb, huge-pages, memory
track: hft

Virtual→physical translation goes through the **TLB**, a small cache of page mappings. A TLB miss triggers a multi-level **page walk** (extra memory accesses). With 4 KB pages, a large working set blows the TLB and every stride pays for a walk.

**Huge pages** (2 MB or 1 GB on x86-64) map far more memory per TLB entry, so a big buffer is covered by a handful of entries — fewer misses, fewer walks. Use `MADV_HUGEPAGE`, explicit hugetlbfs, or reserve at boot, and pre-fault so the pages are resident before the hot path runs. The win shows up for large, randomly-accessed structures (order books, big hash tables), not tight sequential scans the prefetcher already handles.

## fact: Pin, pre-fault, and lock your memory
tags: numa, page-faults, mlock
track: hft

On multi-socket boxes memory is **NUMA**: reaching another socket's RAM costs extra. Linux allocates a page on the node of the thread that **first touches** it, so allocate *and* initialize on the core that will use it, and pin threads (`taskset`/`sched_setaffinity`, plus isolated cores) so they don't migrate off-node.

Two more startup rituals: the first touch of fresh memory takes a **page fault** into the kernel (a *minor* fault, or *major* if it hits disk) — so **pre-fault** by writing every page up front. And `mlock`/`mlockall` pins pages in RAM so nothing is swapped out mid-trade. The pattern: allocate, pre-fault, `mlock`, pin threads, then **warm caches and branch predictors** with dummy iterations before the open — pay every one-time cost before it can hurt.

## fact: Syscalls are expensive; busy-poll instead
tags: kernel-bypass, syscalls, networking
track: hft

A syscall crosses the user/kernel boundary — a mode switch, and since Meltdown/Spectre mitigations possibly page-table switches — costing on the order of **hundreds of nanoseconds up to a microsecond**, plus the risk of blocking and being descheduled.

So HFT **busy-polls** rather than blocking: spin reading a queue/NIC on a dedicated isolated core (100% CPU, but deterministic sub-microsecond wakeups) instead of sleeping on `epoll`/interrupts, which add scheduler and interrupt latency. `SO_BUSY_POLL` makes a socket busy-poll the device. **Kernel-bypass** stacks (DPDK, Solarflare/Onload, `AF_XDP`) go further: they map NIC rings into user space and DMA packets straight to the app, skipping the kernel network stack and its copies entirely — the standard way to shave microseconds off wire-to-trade.

## fact: std::unordered_map chases pointers
tags: hash-map, data-structures, cache
track: hft

The standard requires `std::unordered_map` to behave like **separate chaining with reference stability** (references survive rehash), forcing a **node-per-element** layout: each lookup hashes, then chases a pointer to a scattered heap node — a likely cache miss. Great semantics, poor locality.

**Open-addressing / flat hash maps** (`absl::flat_hash_map`, `boost::unordered_flat_map`, `ankerl::unordered_dense`) store keys/values inline in a contiguous array and probe within it, so a lookup is usually one cache line — often several times faster. Trade-off: pointers/iterators can invalidate on rehash, and erase is a touch more involved. On the hot path, flat maps (or even a sorted `std::vector` with binary search for small/static sets) usually win.

## fact: std::vector beats std::list almost always
tags: containers, vector, cache
track: hft

`std::list` is a doubly-linked list: every node is a **separate allocation**, and traversal **pointer-chases** across scattered memory — a cache miss per element. `std::vector` is contiguous, so iteration streams through cache and the prefetcher loves it. Even mid-insertion (a memmove) usually beats `list`'s "cheap" splice once cache misses dominate — for realistic sizes `vector` wins on nearly every operation. Prefer it by default and `reserve()` to avoid reallocation.

**Small-buffer optimization (SBO/SSO)**: `std::string` and small-vector types (`boost::small_vector`, `llvm::SmallVector`) store short contents **inline** in the object, dodging the heap for the common small case — which is why a short `std::string` never calls `malloc`. Choose containers by memory layout and allocation behavior, not just asymptotic complexity.

## fact: Do it at compile time
tags: constexpr, templates, compile-time
track: hft

Work done at compile time costs zero at run time. `constexpr` (and C++20 `consteval`/`constinit`) evaluates during compilation — precompute lookup tables, parse config, validate constants — so the hot path just reads a baked-in result with no static-init overhead on the fast path.

Templates specialize code per type, so there's **no runtime dispatch**: the compiler emits and inlines a dedicated version, enabling constant folding and vectorization a virtual call would block. Interviewers like to see branching moved to compile time — e.g. templating a strategy on order-type flags so the hot loop has no `if`. The cost is compile time and code bloat (I-cache pressure), so specialize the hot path, not everything.

## fact: volatile is for MMIO, not threads
tags: volatile, atomics, concurrency, trap
track: hft

A classic interview trap. `volatile` tells the compiler "this memory can change outside the program, don't optimize the access away" — it stops the compiler eliding/reordering *volatile* accesses. It does **not** provide atomicity, does **not** establish inter-thread ordering, and emits **no CPU fences**. Using `volatile` for thread communication is a data race (UB) and broken on any weakly-ordered CPU.

`volatile`'s real jobs are **memory-mapped I/O** (hardware registers), signal handlers (`volatile sig_atomic_t`), and `setjmp` locals. For thread-to-thread communication use `std::atomic`, which gives atomicity *and* the memory-order guarantees `volatile` lacks. Slogan: "`volatile` for hardware, `atomic` for threads."

## fact: Inlining is the mother of optimizations
tags: inlining, lto, pgo
track: hft

Inlining removes call overhead but, more importantly, **exposes the callee to the caller's optimizer** — constant propagation, dead-code elimination, and vectorization across the old boundary. That's why hot functions should stay inlinable (small, in headers, non-virtual). The `inline` keyword is mostly about ODR/linkage, not a command; force it with `[[gnu::always_inline]]` when the heuristic is wrong (and `[[gnu::noinline]]` to keep cold paths out of the I-cache).

**LTO** (link-time optimization) inlines and optimizes **across translation units** at link time, recovering what separate compilation lost. **PGO** (profile-guided optimization) feeds a real workload's profile back to the compiler so it co-locates hot code, predicts branches, and inlines what actually runs hot. Both are standard for the last few percent of a latency-critical binary.

## fact: Denormals can be ~100x slower
tags: floating-point, denormals, ftz
track: hft

**Denormal (subnormal) floats** — tiny values near zero below the normal exponent range — are often handled by a slow microcode path on x86, so an op that hits them can run **tens to ~100x slower** than the same op on normal values. Prices/quantities drifting toward zero (decaying weights, near-zero spreads) can silently drop you into this pit and wreck your tail latency.

Fix by telling the FPU to treat them as zero: enable **FTZ (flush-to-zero)** for denormal results and **DAZ (denormals-are-zero)** for denormal inputs via the SSE `MXCSR` register (`_MM_SET_FLUSH_ZERO_MODE(_MM_FLUSH_ZERO_ON)` and `_MM_SET_DENORMALS_ZERO_MODE(_MM_DENORMALS_ZERO_ON)`). `-ffast-math` sets these too (with other trade-offs). The precision loss near zero is a non-issue for trading math, and latency becomes deterministic.
