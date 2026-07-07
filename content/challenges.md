# Challenges

Timed, compile-checked implementation problems — the low-latency C++ that HFT interviews actually ask you to write on a whiteboard or a shared editor. Same card format as drills: prompt, optional `// starter` block, a solution block, and a hidden `// harness` block that injects your code at `//__USER__`, runs it, and must print `PASS`. The clock starts on your first keystroke.

## challenge: SPSC ring buffer
tags: lock-free, spsc, ring-buffer
track: hft

The bread-and-butter HFT structure: a single-producer, single-consumer queue with no locks. Buffer size `N` is a power of two. Track fill with **monotonically increasing** `head_` (pop index) and `tail_` (push index) of type `size_t`; the usable slot is `buf_[i & (N - 1)]`. Implement `bool push(const T& v)` (fails, returns false, when full — size `N`) and `bool pop(T& out)` (fails when empty). Single-threaded correctness only here; the real thing pairs `release`/`acquire` on the indices.

```cpp
// starter
template <class T, size_t N>
struct SpscQueue {
    static_assert((N & (N - 1)) == 0, "N must be a power of two");
    T      buf_[N];
    size_t head_ = 0;   // next to pop
    size_t tail_ = 0;   // next to push
    // implement push / pop
};
```

```cpp
bool push(const T& v) {
    if (tail_ - head_ == N) return false;   // full
    buf_[tail_ & (N - 1)] = v;
    ++tail_;
    return true;
}
bool pop(T& out) {
    if (tail_ == head_) return false;        // empty
    out = buf_[head_ & (N - 1)];
    ++head_;
    return true;
}
```

```cpp
// harness
#include <cstdio>
#include <cstdlib>
#include <cstddef>
using std::size_t;
template <class T, size_t N>
struct SpscQueue {
    static_assert((N & (N - 1)) == 0, "N must be a power of two");
    T      buf_[N];
    size_t head_ = 0;
    size_t tail_ = 0;
    //__USER__
};
int main() {
    SpscQueue<int, 4> q;
    int x = 0;
    if (q.pop(x)) { std::puts("pop on empty must fail"); return 1; }
    for (int i = 0; i < 4; ++i) if (!q.push(i)) { std::puts("push should fit 4"); return 1; }
    if (q.push(99)) { std::puts("push on full must fail"); return 1; }
    for (int i = 0; i < 4; ++i) {
        if (!q.pop(x) || x != i) { std::puts("FIFO order broken"); return 1; }
    }
    if (q.pop(x)) { std::puts("empty again must fail"); return 1; }
    // wrap-around past the buffer end
    for (int r = 0; r < 10; ++r) {
        if (!q.push(r) || !q.pop(x) || x != r) { std::puts("wrap-around broken"); return 1; }
    }
    std::puts("PASS");
}
```

## challenge: Fixed-capacity object pool
tags: allocation, object-pool, memory
track: hft

No `new` on the hot path. Pre-allocate `N` slots, hand them out from a free list. Implement `T* alloc()` (returns `nullptr` when exhausted) and `void release(T* p)` (returns a slot to the pool). Use an intrusive free-list index stack over the storage — no allocation, O(1) both ways.

```cpp
// starter
template <class T, size_t N>
struct Pool {
    alignas(T) unsigned char storage_[N * sizeof(T)];
    size_t free_[N];
    size_t top_ = N;                 // free_[0..top_) hold free indices
    Pool() { for (size_t i = 0; i < N; ++i) free_[i] = N - 1 - i; }
    T* slot(size_t i) { return reinterpret_cast<T*>(storage_) + i; }
    // implement alloc / release
};
```

```cpp
T* alloc() {
    if (top_ == 0) return nullptr;
    return slot(free_[--top_]);
}
void release(T* p) {
    size_t i = static_cast<size_t>(p - slot(0));
    free_[top_++] = i;
}
```

```cpp
// harness
#include <cstdio>
#include <cstddef>
#include <cstdint>
using std::size_t;
template <class T, size_t N>
struct Pool {
    alignas(T) unsigned char storage_[N * sizeof(T)];
    size_t free_[N];
    size_t top_ = N;
    Pool() { for (size_t i = 0; i < N; ++i) free_[i] = N - 1 - i; }
    T* slot(size_t i) { return reinterpret_cast<T*>(storage_) + i; }
    //__USER__
};
int main() {
    Pool<long, 3> p;
    long* a = p.alloc();
    long* b = p.alloc();
    long* c = p.alloc();
    if (!a || !b || !c) { std::puts("first 3 allocs must succeed"); return 1; }
    if (p.alloc() != nullptr) { std::puts("exhausted pool must return nullptr"); return 1; }
    // pointers must land inside storage and be distinct
    if (a == b || b == c || a == c) { std::puts("slots must be distinct"); return 1; }
    p.release(b);
    long* d = p.alloc();
    if (d != b) { std::puts("released slot should be reused"); return 1; }
    if (p.alloc() != nullptr) { std::puts("full again must return nullptr"); return 1; }
    std::puts("PASS");
}
```

## challenge: Branchless min
tags: branchless, bit-tricks
track: hft

Branch mispredicts cost ~15-20 cycles. Compute the minimum of two ints with a bit trick instead of a branch: `b ^ ((a ^ b) & -(a < b))`. Implement `int bmin(int a, int b)` returning the smaller. (The compiler often does this for you — but interviewers ask you to derive it.)

```cpp
int bmin(int a, int b) {
    return b ^ ((a ^ b) & -(a < b));
}
```

```cpp
// harness
#include <cstdio>
#include <climits>
//__USER__
int main() {
    struct { int a, b, want; } cases[] = {
        {3, 5, 3}, {5, 3, 3}, {-2, 4, -2}, {7, 7, 7},
        {0, -1, -1}, {INT_MAX, 0, 0}, {-100, -100, -100}, {1, INT_MAX, 1},
    };
    for (auto& c : cases) {
        int got = bmin(c.a, c.b);
        if (got != c.want) { std::printf("bmin(%d,%d)=%d want %d\n", c.a, c.b, got, c.want); return 1; }
    }
    std::puts("PASS");
}
```

## challenge: Round up to power of two
tags: bit-tricks, ring-buffer
track: hft

Ring-buffer and hash-table sizes are powers of two so the modulo becomes a mask. Implement `uint64_t next_pow2(uint64_t x)` returning the smallest power of two that is `>= x`, for `2 <= x <= 2^62`. Bit-smear then increment.

```cpp
uint64_t next_pow2(uint64_t x) {
    --x;
    x |= x >> 1;  x |= x >> 2;  x |= x >> 4;
    x |= x >> 8;  x |= x >> 16; x |= x >> 32;
    return x + 1;
}
```

```cpp
// harness
#include <cstdio>
#include <cstdint>
//__USER__
int main() {
    struct { uint64_t x, want; } cases[] = {
        {2, 2}, {3, 4}, {5, 8}, {8, 8}, {9, 16},
        {1000, 1024}, {1u << 20, 1u << 20}, {(1u << 20) + 1, 1u << 21},
        {(uint64_t)1 << 61, (uint64_t)1 << 61}, {((uint64_t)1 << 61) + 1, (uint64_t)1 << 62},
    };
    for (auto& c : cases) {
        uint64_t got = next_pow2(c.x);
        if (got != c.want) { std::printf("next_pow2(%llu)=%llu want %llu\n",
            (unsigned long long)c.x, (unsigned long long)got, (unsigned long long)c.want); return 1; }
    }
    std::puts("PASS");
}
```

## challenge: Type-pun a float without UB
tags: undefined-behavior, aliasing, bit-cast
track: hft

Reinterpreting a `float` as its bits via `*(uint32_t*)&f` is a strict-aliasing violation — UB the optimizer can miscompile. The correct, zero-cost way is `std::memcpy` (or C++20 `std::bit_cast`). Implement `uint32_t float_bits(float f)` returning the IEEE-754 bit pattern with no aliasing violation.

```cpp
uint32_t float_bits(float f) {
    uint32_t bits;
    std::memcpy(&bits, &f, sizeof bits);
    return bits;
}
```

```cpp
// harness
#include <cstdio>
#include <cstdint>
#include <cstring>
//__USER__
int main() {
    if (float_bits(1.0f)  != 0x3f800000u) { std::puts("1.0f wrong"); return 1; }
    if (float_bits(0.0f)  != 0x00000000u) { std::puts("0.0f wrong"); return 1; }
    if (float_bits(-2.0f) != 0xc0000000u) { std::puts("-2.0f wrong"); return 1; }
    if (float_bits(2.0f)  != 0x40000000u) { std::puts("2.0f wrong"); return 1; }
    std::puts("PASS");
}
```

## challenge: O(1) swap-remove
tags: cache, vector, data-structures
track: hft

When order doesn't matter, erasing from the middle of a `std::vector` in O(n) (shifting) is wasteful. Swap the target with the last element and pop — O(1), cache-friendly. Implement `void swap_remove(std::vector<int>& v, size_t i)` removing the element at index `i` (assume `i < v.size()`).

```cpp
void swap_remove(std::vector<int>& v, size_t i) {
    v[i] = v.back();
    v.pop_back();
}
```

```cpp
// harness
#include <cstdio>
#include <vector>
#include <cstddef>
//__USER__
int main() {
    std::vector<int> v{10, 20, 30, 40, 50};
    swap_remove(v, 1);                 // remove 20 -> {10,50,30,40}
    if (v.size() != 4) { std::puts("size wrong"); return 1; }
    if (v[0]!=10 || v[1]!=50 || v[2]!=30 || v[3]!=40) { std::puts("contents wrong"); return 1; }
    swap_remove(v, 3);                 // remove last (40) -> {10,50,30}
    if (v.size()!=3 || v[2]!=30) { std::puts("remove-last wrong"); return 1; }
    swap_remove(v, 0);                 // remove 10 -> {30,50}
    if (v.size()!=2 || v[0]!=30 || v[1]!=50) { std::puts("remove-first wrong"); return 1; }
    std::puts("PASS");
}
```

## challenge: popcount without the builtin
tags: bit-tricks
track: hft

Count set bits. Kernighan's trick clears the lowest set bit each iteration (`x &= x - 1`), so it loops once per set bit rather than 64 times. Implement `int popcount(uint64_t x)` without `__builtin_popcount` / `std::popcount`.

```cpp
int popcount(uint64_t x) {
    int n = 0;
    while (x) { x &= x - 1; ++n; }
    return n;
}
```

```cpp
// harness
#include <cstdio>
#include <cstdint>
//__USER__
int main() {
    if (popcount(0) != 0) { std::puts("0 wrong"); return 1; }
    if (popcount(1) != 1) { std::puts("1 wrong"); return 1; }
    if (popcount(0xFFull) != 8) { std::puts("0xFF wrong"); return 1; }
    if (popcount(~0ull) != 64) { std::puts("all-ones wrong"); return 1; }
    if (popcount(0xF0F0ull) != 8) { std::puts("0xF0F0 wrong"); return 1; }
    std::puts("PASS");
}
```

## challenge: Cache-line aligned counter (kill false sharing)
tags: false-sharing, cache, alignas
track: hft

Two threads incrementing two counters that share a 64-byte cache line ping-pong the line between cores — "false sharing" — and throughput collapses. Fix it by padding each counter onto its own line. Complete `PaddedCounter` so that `sizeof(PaddedCounter) == 64` and `alignof(PaddedCounter) == 64`, with a `long value` member.

```cpp
// starter
struct PaddedCounter {
    // your code: a `long value;` plus padding, aligned to a cache line
};
```

```cpp
struct alignas(64) PaddedCounter {
    long value = 0;
    char pad_[64 - sizeof(long)];
};
```

```cpp
// harness
#include <cstdio>
#include <cstddef>
//__USER__
int main() {
    static_assert(alignof(PaddedCounter) == 64, "must be cache-line aligned");
    static_assert(sizeof(PaddedCounter) == 64, "must fill one cache line");
    PaddedCounter a, b;
    a.value = 5; b.value = 7;
    if (a.value + b.value != 12) { std::puts("value member broken"); return 1; }
    std::puts("PASS");
}
```
