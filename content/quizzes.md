# Quizzes

Card format: `## quiz: Question title`, optional `tags:`, optional ```cpp block, options as `- [ ]` / `- [x]` (checked = correct), explanation as `> ` blockquote.

## quiz: What does this print?
tags: core, virtual

```cpp
struct Base {
    Base() { who(); }
    virtual void who() { std::cout << "Base "; }
};
struct Derived : Base {
    void who() override { std::cout << "Derived "; }
};
int main() { Derived d; d.who(); }
```

- [ ] Derived Derived
- [x] Base Derived
- [ ] Derived Base
- [ ] Undefined behavior

> Inside a constructor, the object's dynamic type is the class being constructed. `Base()` runs before `Derived` exists, so the call inside it dispatches to `Base::who`. Virtual dispatch "starts working" per-level as construction proceeds.

## quiz: Which singleton implementation is thread-safe without locks?
tags: patterns, singleton

- [ ] `static Config* p = nullptr; if (!p) p = new Config;` inside `instance()`
- [x] `static Config cfg;` inside `instance()`, returning a reference
- [ ] A global `Config cfg;` at namespace scope, returned by `instance()`
- [ ] Double-checked locking with a plain `bool` flag

> Function-local statics get thread-safe initialization guaranteed by the standard since C++11 (Meyers Singleton). The lazy-pointer version races; the namespace-scope global has initialization-order problems across translation units; DCL with a plain bool is a data race.

## quiz: How many copy constructions happen?
tags: move, core

```cpp
std::vector<std::string> v;
std::string s = "hello";
v.push_back(std::move(s));
v.push_back("world");
```

- [x] 0
- [ ] 1
- [ ] 2
- [ ] Depends on the compiler

> `std::move(s)` makes the first push_back call the move overload. `"world"` constructs a temporary `std::string` which is an rvalue — moved too. (A reallocation between the two calls would move, not copy, since `std::string`'s move is `noexcept`.)

## quiz: What is wrong with this design?
tags: patterns, smart-pointers

```cpp
struct Node {
    std::shared_ptr<Node> next;
    std::shared_ptr<Node> prev;   // doubly linked
};
```

- [ ] shared_ptr is too slow for linked lists
- [x] next/prev cycles keep reference counts above zero — the list leaks
- [ ] Node needs a virtual destructor
- [ ] shared_ptr cannot point to an incomplete type

> Two nodes pointing at each other hold each other's count at ≥1 forever, so neither is ever destroyed. The fix is to break the cycle: make one direction non-owning, typically `std::weak_ptr<Node> prev;` (or raw pointer if lifetime is externally guaranteed).

## quiz: What does this print?
tags: core, slicing

```cpp
struct Animal { virtual std::string speak() const { return "..."; } };
struct Dog : Animal { std::string speak() const override { return "woof"; } };

void greet(Animal a) { std::cout << a.speak(); }
int main() { Dog d; greet(d); }
```

- [ ] woof
- [x] ...
- [ ] Compile error
- [ ] Undefined behavior

> `greet` takes `Animal` **by value**: the `Dog` is sliced — only the `Animal` subobject is copied, and the dynamic type of `a` is exactly `Animal`. Virtual dispatch has nothing to dispatch to. Pass polymorphic types by reference or pointer.

## quiz: You need many parts of the app to react when a download finishes, without the downloader knowing who they are. Which pattern?
tags: patterns

- [ ] Strategy
- [ ] Factory Method
- [x] Observer
- [ ] Adapter

> One-to-many notification with the subject decoupled from receivers is Observer (a.k.a. publish/subscribe, signals/slots). Strategy swaps an algorithm; Factory creates objects; Adapter converts an interface.

## quiz: What mechanism does this code use?
tags: patterns, crtp, templates

```cpp
template <class D>
struct Counter {
    static inline int alive = 0;
    Counter() { ++alive; }
    ~Counter() { --alive; }
};
struct Widget : Counter<Widget> {};
struct Gadget : Counter<Gadget> {};
```

- [ ] Type erasure
- [ ] Virtual inheritance
- [x] CRTP — each derived class gets its own base instantiation and its own counter
- [ ] Dependency injection

> Curiously Recurring Template Pattern: `Counter<Widget>` and `Counter<Gadget>` are distinct types, so each derived class gets an independent `alive` counter — per-type behavior with zero runtime overhead.

## quiz: What happens here?
tags: core, smart-pointers

```cpp
std::unique_ptr<int> a = std::make_unique<int>(42);
std::unique_ptr<int> b = a;
```

- [x] Compile error — unique_ptr's copy constructor is deleted
- [ ] b becomes a dangling pointer
- [ ] Both point to 42; last one to die frees it
- [ ] Runtime crash

> Unique ownership means no copies: the copy constructor and copy assignment are `= delete`. Transfer requires an explicit `std::unique_ptr<int> b = std::move(a);`, after which `a` is null.

## quiz: What does this print?
tags: core, containers

```cpp
std::map<std::string, int> m;
m["a"];
if (m["b"] == 1) {}
std::cout << m.size();
```

- [ ] 0
- [ ] 1
- [x] 2
- [ ] Undefined behavior

> `operator[]` on a map **inserts** a value-initialized element when the key is missing — even in a read-looking expression. Both `m["a"]` and `m["b"]` insert (values 0). Use `.find()`, `.at()`, `.contains()` (C++20) to look up without inserting.

## quiz: Which statement about this factory is true?
tags: patterns, factory

```cpp
std::unique_ptr<Shape> make_shape(std::string_view kind) {
    if (kind == "circle") return std::make_unique<Circle>();
    if (kind == "square") return std::make_unique<Square>();
    return nullptr;
}
```

- [x] Callers own the result and never see concrete types — classic Factory decoupling
- [ ] It leaks unless callers call delete
- [ ] It should return shared_ptr, unique_ptr can't hold derived types
- [ ] Returning nullptr from a unique_ptr function is undefined behavior

> The factory function centralizes construction, returns ownership via `unique_ptr<Base>` (upcast from `unique_ptr<Derived>` works out of the box — but remember `Shape` needs a virtual destructor). A null `unique_ptr` is a perfectly valid "not found" result, though `std::optional`-style designs or exceptions are alternatives.
