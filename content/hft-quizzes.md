# HFT Quizzes

Card format: `## quiz: Question title`, `tags:`, `track: hft`, optional ```cpp block, options as `- [ ]` / `- [x]` (checked = correct), explanation as `> ` blockquote. Every card carries `track: hft`.

## quiz: Two threads each hammer their own atomic — why is this slow?
tags: concurrency, cache, false-sharing
track: hft

```cpp
struct Counters {
    std::atomic<long> a;   // thread 1 does c.a.fetch_add(1) in a tight loop
    std::atomic<long> b;   // thread 2 does c.b.fetch_add(1) in a tight loop
};
Counters c;
```

- [ ] Atomic increments are inherently serialized across all cores
- [x] `a` and `b` live in the same 64-byte cache line, so the two cores keep invalidating each other's copy (false sharing); give each its own line with `alignas(64)`
- [ ] The compiler reorders the two increments into a single contended one
- [ ] `std::atomic<long>` takes a global lock internally

> Even though the threads touch different variables, `a` and `b` share one cache line. Every write forces the line into the writing core's cache in Modified state, invalidating the other core's copy — the line ping-pongs on the interconnect. Padding/aligning each counter to its own 64-byte line (`alignas(64) std::atomic<long> a;`) eliminates the contention.

## quiz: Minimum correct memory ordering for an SPSC flag handoff
tags: concurrency, memory-order, atomics
track: hft

```cpp
int data;
std::atomic<bool> ready{false};
// producer:            // consumer:
data = 42;              while (!ready.load(/* ? */)) {}
ready.store(true, /* ? */);   use(data);
```

- [ ] `relaxed` on both — the atomic is enough
- [x] `release` on the store, `acquire` on the load
- [ ] `acquire` on the store, `release` on the load
- [ ] `seq_cst` on both is the only correct choice

> The store-release publishes every write sequenced before it (including `data = 42`); the load-acquire, once it observes `true`, is guaranteed to see those writes — that release/acquire pair creates the happens-before edge. `relaxed` gives no ordering, so the consumer could read a stale/torn `data`. The acquire/release pair is the *minimum* correct ordering; `seq_cst` also works but is stronger (and slower) than needed here.

## quiz: Is `volatile` a valid substitute for `std::atomic` here?
tags: concurrency, volatile, atomics
track: hft

```cpp
volatile int ready = 0;
volatile int data  = 0;
// thread A: data = 42; ready = 1;
// thread B: while (!ready) {}  use(data);
```

- [ ] `volatile` makes the accesses atomic and correctly ordered across threads
- [x] `volatile` provides neither atomicity nor inter-thread ordering — this is a data race (UB); use `std::atomic`
- [ ] It is correct but simply slower than `std::atomic`
- [ ] It works on x86 but the `int` may still be torn

> `volatile` only tells the compiler not to elide or fold the accesses (it was designed for memory-mapped I/O). It creates no happens-before relationship and issues no hardware fences, so the CPU/compiler can still reorder `data` relative to `ready` and thread B may never observe the update. Concurrent conflicting access without atomics is a data race and therefore undefined behavior. Use `std::atomic` with the right memory order.

## quiz: Many threads run `counter++` on a shared `long long`
tags: concurrency, data-race, atomics
track: hft

```cpp
long long counter = 0;   // shared, non-atomic
// many threads: counter++;
```

- [ ] Fine, because aligned 64-bit stores are atomic on x86-64
- [ ] Fine, as long as exactly one thread ever writes
- [x] `counter++` is a read-modify-write data race — concurrent conflicting access without atomics is UB, and updates are lost
- [ ] Marking it `volatile` would make `++` atomic

> `counter++` is three steps: load, add, store. Two threads can both load the same value and each store back the same `+1`, losing an update. Even setting aside lost updates, the C++ memory model says two threads accessing the same non-atomic object where at least one writes is a data race — undefined behavior — so the compiler is free to assume it never happens. `volatile` does not make `++` atomic. Use `std::atomic<long long>` with `fetch_add`.

## quiz: Why is `std::unordered_map` lookup slower than a flat/open-addressing map?
tags: containers, cache, hash-map
track: hft

- [ ] `unordered_map` is required to use a weaker default hash function
- [x] The standard mandates a node-based design: buckets hold chains of separately heap-allocated nodes, so each probe chases a pointer to a scattered address (cache miss); an open-addressing map stores entries in one contiguous array
- [ ] `unordered_map` is forbidden from using SIMD internally
- [ ] Its maximum load factor is capped at 0.5

> `std::unordered_map` must give reference/pointer stability, which forces separately allocated nodes linked into buckets. A lookup hashes to a bucket and then pointer-chases the chain, and those nodes sit at random heap addresses — one cache miss per hop, plus per-insert allocation. A flat/open-addressing map (e.g. a Swiss-table style `flat_hash_map`) keeps keys in a contiguous array and probes neighbors that are already in cache, which is why it usually wins on the hot path.

## quiz: Summing elements: `std::vector<int>` vs `std::list<int>` of the same size
tags: containers, cache, locality
track: hft

- [x] `vector` is much faster: contiguous storage lets the hardware prefetcher stream the data with few cache misses; `list` nodes are scattered, costing a cache miss per hop
- [ ] `list` is faster because traversal is O(1) per node
- [ ] They are equally fast since both are O(N)
- [ ] `list` is faster because it skips bounds checking

> Both are O(N) in the abstract, but wall-clock time is dominated by the memory system. A `vector`'s elements are laid out contiguously, so sequential access triggers the prefetcher and touches each cache line once. A `list` allocates each node independently, so traversal is a chain of pointer dereferences to unpredictable addresses — typically a cache miss per element. Contiguity, not asymptotics, decides this.

## quiz: What decides whether a `vector` reallocation moves or copies its elements?
tags: move, noexcept, vector
track: hft

```cpp
struct Widget {
    std::vector<int> data;
    Widget(Widget&&) /* noexcept? */;
    Widget(const Widget&);
};
std::vector<Widget> v;   // grows past capacity -> reallocation
```

- [ ] It always moves in C++11 and later
- [x] It moves only if the move constructor is `noexcept` (or no copy ctor exists); otherwise it copies, to preserve the strong exception guarantee
- [ ] It always copies unless you call `reserve` first
- [ ] `noexcept` is irrelevant; only `-O2` enables the moves

> `vector` reallocation uses `move_if_noexcept`. If moving an element could throw and a copy constructor is available, it copies instead — because a throw partway through moving would leave both the old and new buffers in a broken state, violating the strong exception guarantee. So a non-`noexcept` move ctor silently degrades your `vector` growth to copies. Mark move constructors `noexcept`.

## quiz: How many copies or moves are printed?
tags: move, copy-elision, rvo
track: hft

```cpp
struct S {
    S() {}
    S(const S&) { std::puts("copy"); }
    S(S&&)      { std::puts("move"); }
};
S make() { return S{}; }
int main() { S s = make(); }
```

- [x] 0 — guaranteed copy elision (C++17) constructs the object directly into `s`
- [ ] 1 move
- [ ] 1 copy
- [ ] 2 moves

> Since C++17, returning a prvalue whose type matches the return type, and initializing a variable from a prvalue, are *not* copies or moves — the object is materialized directly in the destination. No copy or move constructor is called (it need not even be accessible). So nothing prints. This is stronger than the pre-C++17 "as-if" RVO, which merely *permitted* elision.

## quiz: Cost of passing `std::shared_ptr` by value on the hot path
tags: smart-pointers, atomics, hot-path
track: hft

```cpp
void process(std::shared_ptr<Order> o);   // called millions of times per second
```

- [ ] Free — copying a `shared_ptr` is just copying a pointer
- [x] Each copy is an atomic increment of the refcount and each destruction an atomic decrement — synchronized RMW operations that are expensive under contention; pass by `const&` or by raw reference on the hot path
- [ ] The copy deep-copies the pointed-to `Order`
- [ ] Copies are cheap but the destructor allocates

> A `shared_ptr` copy bumps the control block's reference count with an atomic `fetch_add`, and the destructor does an atomic `fetch_sub` (with a release/acquire fence so the last one frees safely). Atomic RMWs are far costlier than a plain pointer copy, especially when multiple cores touch the same control block. When you are not transferring ownership, pass `const std::shared_ptr&`, or better a raw `Order*`/`Order&`.

## quiz: What is the optimizer allowed to do with this function?
tags: undefined-behavior, integer-overflow, optimizer
track: hft

```cpp
int f(int x) {
    return x + 1 > x;   // x is an arbitrary int
}
```

- [ ] Return `false` when `x == INT_MAX`
- [x] Assume signed overflow never happens and compile the body to `return 1;`
- [ ] Insert a runtime overflow check
- [ ] Wrap at `INT_MAX`, so it is implementation-defined

> Signed integer overflow is undefined behavior, so the compiler may assume `x + 1` never overflows — which makes `x + 1 > x` unconditionally true. GCC/Clang fold this to a constant `1`, even for `x == INT_MAX`. (Unsigned arithmetic is defined to wrap, so the analogous unsigned version really can be false.) This is a textbook case of UB enabling a surprising optimization.

## quiz: Reading the bits of a `float` as an `int`
tags: undefined-behavior, strict-aliasing, type-punning
track: hft

```cpp
float f = 1.0f;
int i = *reinterpret_cast<int*>(&f);   // (A)
int j; std::memcpy(&j, &f, sizeof j);  // (B)
```

- [ ] Both are fine; `reinterpret_cast` is the idiomatic way
- [x] (A) violates strict aliasing and is UB; (B) via `memcpy` (or `std::bit_cast`) is the well-defined way to reinterpret bits
- [ ] (B) is UB because `memcpy` ignores the types
- [ ] Both are UB; a `union` is the only correct option

> Accessing the storage of a `float` through an `int` lvalue breaks the strict-aliasing rule — the compiler assumes an `int*` and a `float*` never refer to the same object and may miscompile accordingly. `std::memcpy` copies the underlying bytes and is fully defined; `std::bit_cast<int>(f)` (C++20) is the modern one-liner and is `constexpr`. Union type-punning is defined in C but not portably in C++.

## quiz: Same data, but one run sorts the array first — which loop is faster?
tags: branch-prediction, performance
track: hft

```cpp
// large array of random 0..255 values
long sum = 0;
for (int x : data)
    if (x >= 128) sum += x;
```

- [x] Sorted is much faster: the branch becomes predictable (a long not-taken run, then a long taken run), so the CPU rarely mispredicts and flushes the pipeline
- [ ] Unsorted is faster because sorting evicts the data from cache
- [ ] Identical — a single comparison is not affected by branch prediction
- [ ] Sorted is slower because the sort's O(n log n) cost is paid inside the loop

> On random data the `x >= 128` branch is taken about half the time and is essentially unpredictable, so the branch predictor misses often and each miss flushes the pipeline (tens of cycles). After sorting, the branch is not-taken for the whole first half and taken for the second half — trivially predictable — so misprediction nearly vanishes. Rewriting it branchlessly (e.g. `sum += (x >= 128) * x` / a `cmov`) removes the dependence on prediction entirely.

## quiz: What is the cost model of C++ exceptions on the hot path?
tags: exceptions, hot-path, performance
track: hft

- [ ] `try`/`catch` adds overhead to every call even when nothing throws
- [x] With the table-based ("zero-cost") model the non-throwing path is essentially free, but an actual `throw` is very slow and non-deterministic (unwinding, RTTI) — so avoid throwing on the hot path
- [ ] Exceptions are faster than error codes on the happy path
- [ ] `-fno-exceptions` makes throwing faster

> Modern implementations use side tables to drive unwinding, so entering a `try` block costs nothing at runtime — the happy path is as fast as no exceptions at all. The price is paid only when you actually `throw`: the runtime walks unwind tables, runs destructors, and matches handlers, which is slow and has high variance — poison for tail latency. `-fno-exceptions` removes exception support entirely (shrinks the binary, forbids throwing code); it does not speed up throws.

## quiz: Virtual call vs CRTP/template dispatch — where does the cost come from?
tags: virtual, crtp, inlining
track: hft

- [ ] A virtual call is exactly as fast as a direct call once the vtable is in cache
- [x] A virtual call is an indirect call through the vtable that usually cannot be inlined, which blocks downstream optimizations; CRTP/templates bind the call at compile time so it inlines
- [ ] CRTP is slower because template instantiation always bloats the i-cache and loses
- [ ] Virtual calls are cheap; the real cost is the virtual destructor

> The vtable load and indirect branch are cheap in isolation; the real cost is that the compiler cannot see the callee through an indirect call, so it cannot inline it or propagate constants across the boundary — and it may eat a branch mispredict or i-cache miss on the target. CRTP (or plain templates) resolves the concrete type at compile time, so the call is direct and inlinable. Code bloat from many instantiations is a genuine trade-off, but on the hot path the inlining win usually dominates.

## quiz: How should you measure sub-microsecond per-operation latency?
tags: measurement, latency, rdtsc
track: hft

- [ ] Take the mean of `std::chrono::system_clock`; it is monotonic and nanosecond-accurate
- [x] Use a high-resolution monotonic source (`rdtsc` / `steady_clock`) and report tail percentiles (p99, p99.9, max), not the mean — latency distributions are heavy-tailed
- [ ] The mean latency fully characterizes the tail
- [ ] `system_clock` is best because it can step backwards to correct for drift

> `system_clock` is wall-clock time and can jump backward or forward (NTP, adjustments), so it is wrong for measuring elapsed durations — use `steady_clock` or, for the lowest overhead, `rdtsc` (with care: serialize it, rely on invariant TSC, and beware core migration and cycle-to-nanosecond conversion). And a single number is not enough: HFT cares about the tail, so report p99/p99.9/max, not the mean, which hides exactly the spikes that hurt.

## quiz: Why is the *first* write to a freshly `mmap`ed buffer slow?
tags: memory, tlb, page-fault, huge-pages
track: hft

```cpp
char* p = static_cast<char*>(mmap(/* anonymous, lazily backed */));
p[offset] = 1;   // first touch is slow
```

- [ ] The memory bus is cold and needs to warm up
- [x] The first touch triggers a page fault: the kernel maps and zeroes a physical page and fills a TLB entry; pre-fault (warm/`MAP_POPULATE`/`mlock`) and use huge pages to cut fault and TLB-miss cost
- [ ] `mmap` returns uninitialized junk that hardware must `memset` first
- [ ] The slowdown is a kernel transition on *every* access, not just the first

> Anonymous mappings are demand-paged: the virtual range exists but no physical page is backing it until you touch it. The first access faults into the kernel, which allocates and zero-fills a physical frame, updates the page tables, and populates the TLB — hundreds to thousands of cycles. Later accesses are fast until the TLB entry is evicted. Huge pages (2 MB) cover far more address space per TLB entry (fewer TLB misses), and pre-faulting during startup moves the one-time fault cost out of the hot path.

## quiz: What is the ABA hazard in this lock-free pop?
tags: concurrency, lock-free, cas, aba
track: hft

```cpp
Node* head = top.load();
while (!top.compare_exchange_weak(head, head->next)) {}
// ... return head;
```

- [ ] `compare_exchange_weak` can fail spuriously and corrupt the list
- [x] Between the load and the CAS, `head` can be popped and a *different* node reused at the same address; the pointer compares equal (A→B→A), so the CAS wrongly succeeds using a stale `head->next`
- [ ] CAS on a pointer is not atomic, so `head->next` can tear
- [ ] The loop can never terminate under contention

> The CAS only checks that the raw pointer bits still equal `head`. If another thread pops A, pops B, then pushes a freshly allocated node that the allocator happens to place at A's old address, the pointer looks unchanged even though `head->next` (read from a node that may already be freed/reused) is now stale — the CAS succeeds and corrupts the stack. Fixes: tagged/versioned pointers (a counter in spare bits), hazard pointers, or epoch/RCU reclamation. The spurious failure of the `weak` form is expected and simply retries — that is not the bug.

## quiz: Denormals (subnormals) and low-latency floating point
tags: floating-point, denormals, ftz
track: hft

- [ ] Denormals speed up math because they use fewer significant bits
- [x] Producing or consuming subnormal results can be 10–100x slower via a microcode path; enabling FTZ/DAZ flushes them to zero to keep latency deterministic
- [ ] Denormals affect only correctness, never performance
- [ ] FTZ increases precision near zero

> Subnormal (denormal) floats fill the gap between the smallest normal number and zero, but on x86 the hardware often handles them through a slow microcode assist, producing large, unpredictable latency spikes when your data drifts toward zero. Setting FTZ (flush results to zero) and DAZ (treat inputs as zero) in the MXCSR trades a little precision near zero for constant, fast behavior — standard practice in trading code.

## quiz: Which `memory_order` is appropriate for a pure event counter?
tags: concurrency, memory-order, relaxed
track: hft

```cpp
std::atomic<uint64_t> events{0};
// many threads:
events.fetch_add(1, /* ? */);
// read once, at shutdown
```

- [ ] It must be `seq_cst` or the total will be wrong
- [x] `relaxed` is sufficient: the RMW is still atomic (no lost updates); you just don't need it ordered against other memory operations
- [ ] `relaxed` can lose increments under contention
- [ ] `release` is required on every `fetch_add`

> `memory_order_relaxed` still guarantees the increment is a single atomic read-modify-write, so no updates are lost no matter how many threads contend. What it drops is *ordering* relative to other variables — and a standalone counter that nobody uses to publish other data needs no such ordering. It is the cheapest correct choice; `seq_cst` would add global-ordering fences you do not need here.

## quiz: Spinlock vs `std::mutex` for a very short critical section
tags: concurrency, spinlock, mutex, latency
track: hft

- [ ] Always use `std::mutex`; spinlocks are deprecated
- [x] For an extremely short critical section a spinlock can win by staying in userspace (no syscall/context switch), but it burns a core and degrades badly under contention or oversubscription
- [ ] A spinlock is always faster than a mutex
- [ ] `std::mutex` never makes a system call

> An uncontended `std::mutex` lock is typically a fast userspace atomic, but on contention it futex-sleeps — a syscall plus a context switch, which is terrible for tail latency. A spinlock keeps the waiter in userspace, which is a clear win when the holder releases within nanoseconds and the waiter has a dedicated core (add `_mm_pause()` in the loop to be hyperthread-friendly). But if the holder is descheduled — common under oversubscription — the spinner wastes an entire time slice, so a spinlock is not unconditionally faster.

## quiz: Is `std::atomic<T>` always lock-free?
tags: concurrency, atomics, lock-free
track: hft

```cpp
struct Big { double a, b, c; };   // 24 bytes
std::atomic<Big> x;
```

- [ ] Every `std::atomic` specialization is lock-free by definition
- [x] For a type too large for a single hardware atomic instruction (a 24-byte struct), the implementation falls back to a hidden lock; check `is_lock_free()` — a "lock-free" atomic that isn't defeats the purpose on the hot path
- [ ] `std::atomic<Big>` fails to compile
- [ ] It is lock-free but every load allocates

> `std::atomic` works for any trivially copyable type, but the CPU can only perform a truly atomic operation on operands up to its widest atomic instruction (8 bytes, or 16 with `cmpxchg16b`). A 24-byte struct exceeds that, so libstdc++/libc++ guard it with an internal lock (a mutex or a striped lock table), and reads/writes are no longer wait-free. Query `x.is_lock_free()` or the compile-time `std::atomic<Big>::is_always_lock_free`; a surprise lock in your supposedly lock-free fast path is a latency trap.
