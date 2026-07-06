# Facts

Card format: `## fact: Title`, optional `tags:` line, body markdown, optional ```cpp block.

## fact: RAII is the pattern behind every other C++ pattern
tags: raii, core

Resource Acquisition Is Initialization: tie a resource's lifetime to an object's lifetime. Acquire in the constructor, release in the destructor. The compiler then guarantees cleanup on every exit path — returns, exceptions, early breaks.

`std::lock_guard`, `std::unique_ptr`, `std::fstream`, `std::jthread` — all RAII. If you write `new`/`delete` or `lock()`/`unlock()` by hand in application code, you are usually reinventing a worse version of it.

```cpp
{
    std::lock_guard<std::mutex> lk(m); // acquired
    do_work();                          // may throw — fine
}                                       // released, always
```

## fact: The Rule of Zero beats the Rule of Five
tags: raii, core

If your class needs a custom destructor, copy constructor, copy assignment, move constructor, or move assignment — it almost certainly needs all five (Rule of Five). But the better goal is the **Rule of Zero**: own resources only through members that already manage themselves (`std::string`, `std::vector`, `std::unique_ptr`), and write none of the five.

Special members you don't write can't have bugs.

## fact: Meyers Singleton — thread-safe since C++11
tags: patterns, singleton

A function-local `static` is initialized exactly once, and since C++11 the standard guarantees that initialization is thread-safe ("magic statics"). No locks, no `std::call_once`, no double-checked locking.

```cpp
Config& Config::instance() {
    static Config cfg;   // initialized once, thread-safe
    return cfg;
}
```

It also solves the static initialization order fiasco: the object is created on first use, not at some unspecified point before `main`.

## fact: CRTP — polymorphism with zero vtables
tags: patterns, crtp, templates

The Curiously Recurring Template Pattern: a base class templated on its own derived class. The base can call derived methods via `static_cast<Derived*>(this)` — resolved at compile time, inlined, no virtual dispatch cost.

```cpp
template <class Derived>
struct Shape {
    double area() const {
        return static_cast<const Derived*>(this)->area_impl();
    }
};
struct Circle : Shape<Circle> {
    double area_impl() const { return 3.14159 * r * r; }
    double r = 1.0;
};
```

Used all over the standard library and libraries like Eigen. Since C++23, "deducing this" covers many CRTP use cases with less ceremony.

## fact: PIMPL — the compile-time firewall
tags: patterns, pimpl

Pointer to IMPLementation: the header exposes only a forward-declared `struct Impl;` and a `std::unique_ptr<Impl>`. All members live in the .cpp file. Changing private members no longer recompiles every file that includes your header.

Gotcha: the destructor must be defined in the .cpp (`Widget::~Widget() = default;`), because `unique_ptr<Impl>` needs the complete type to delete it.

## fact: Visitor without a class hierarchy
tags: patterns, visitor, variant

`std::variant` + `std::visit` + the `overloaded` idiom replaces the classic double-dispatch Visitor pattern — no base class, no `accept()` boilerplate, and the compiler errors if you forget a case.

```cpp
template<class... Ts> struct overloaded : Ts... { using Ts::operator()...; };

std::variant<Circle, Square> shape = Circle{2.0};
double a = std::visit(overloaded{
    [](const Circle& c) { return 3.14159 * c.r * c.r; },
    [](const Square& s) { return s.side * s.side; }
}, shape);
```

## fact: Strategy pattern is often just std::function
tags: patterns, strategy

The GoF Strategy pattern — swap an algorithm at runtime — needed an interface, virtual method, and concrete class per strategy. Modern C++ collapses it to a `std::function` member (or a template parameter if the strategy is fixed at compile time).

```cpp
class Sorter {
    std::function<bool(int,int)> cmp = std::less<int>{};
public:
    void set_strategy(std::function<bool(int,int)> f) { cmp = std::move(f); }
};
```

Virtual hierarchy still wins when strategies carry heavy state or need multiple methods.

## fact: std::move doesn't move anything
tags: move, core

`std::move(x)` is just a cast to rvalue reference — `static_cast<T&&>(x)`. It moves nothing; it only marks `x` as "safe to steal from". The actual move happens in whatever move constructor or move assignment receives it. If nothing receives it, nothing happens.

Corollary: `std::move` on a `const` object silently copies — the move constructor can't bind to `const T&&`... but the copy constructor can.

## fact: A base class without a virtual destructor is a trap
tags: core, inheritance

Deleting a derived object through a base pointer is **undefined behavior** unless the base destructor is `virtual`. The derived destructor never runs; members leak.

Rule: a base class should have either a `virtual` destructor (polymorphic use) or a `protected` non-virtual one (interface-only use, no deletion through base).

## fact: string_view is a borrow, not a string
tags: core, lifetime

`std::string_view` is a pointer + length into memory it does not own. It is perfect for read-only parameters — no allocation, accepts literals and `std::string` alike. It is a landmine as a return value or a member: the moment the underlying string dies, the view dangles.

```cpp
std::string_view bad() {
    std::string s = "temporary";
    return s;              // dangling view — UB on use
}
```

## fact: The Observer pattern's modern problem is lifetime, not dispatch
tags: patterns, observer

Classic Observer: subject holds raw pointers to observers and calls `notify()`. The 2020s version: subject holds `std::vector<std::function<void(Event)>>` for dispatch — but the real design question is unsubscription. If an observer dies while subscribed, notify calls into freed memory.

Common answers: token-based unsubscribe, `std::weak_ptr` per observer checked at notify time, or a signals library (Boost.Signals2, Qt).

## fact: if constexpr killed half of template metaprogramming
tags: templates, core

Before C++17, choosing behavior per-type inside a template needed tag dispatch or SFINAE overloads. `if constexpr` discards the untaken branch at compile time — the discarded branch doesn't even need to compile for that type.

```cpp
template <class T>
auto describe(const T& x) {
    if constexpr (std::is_integral_v<T>)
        return x * 2;              // only compiled for ints
    else
        return x.size();           // only compiled for containers
}
```

With C++20 concepts, `requires` clauses handle the overload-selection half too.
