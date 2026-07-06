# Exercises

Card format: `## exercise: Title`, optional `tags:`, prompt paragraphs, optional starter code as ```cpp block marked `// starter`, expected solution as the last ```cpp block. Checking ignores whitespace differences, so name things exactly as the prompt says.

## exercise: Meyers Singleton
tags: patterns, singleton

Write the body of `instance()` so that `Config` is a lazy, thread-safe singleton. Use a function-local static named `cfg`.

```cpp
// starter
class Config {
public:
    static Config& instance();
private:
    Config() = default;
};
```

```cpp
Config& Config::instance() {
    static Config cfg;
    return cfg;
}
```

## exercise: RAII file guard
tags: raii, patterns

Write a class `File` that opens a `FILE*` with `fopen(path, "r")` in its constructor (member named `f`, parameter named `path`, type `const char*`) and closes it with `fclose(f)` in its destructor if it is non-null.

```cpp
class File {
    FILE* f;
public:
    File(const char* path) : f(fopen(path, "r")) {}
    ~File() { if (f) fclose(f); }
};
```

## exercise: Make a class non-copyable
tags: raii, core

`Connection` must never be copied. Delete its copy constructor and copy assignment operator (in that order).

```cpp
// starter
class Connection {
public:
    // your two lines here
};
```

```cpp
Connection(const Connection&) = delete;
Connection& operator=(const Connection&) = delete;
```

## exercise: Factory function
tags: patterns, factory

Write a function `make_circle` taking `double r` and returning a `std::unique_ptr<Shape>` holding a `Circle` constructed with `r`. Use `std::make_unique`. One line body.

```cpp
// starter
struct Shape { virtual ~Shape() = default; };
struct Circle : Shape { explicit Circle(double r); };
```

```cpp
std::unique_ptr<Shape> make_circle(double r) {
    return std::make_unique<Circle>(r);
}
```

## exercise: Observer — subscribe and notify
tags: patterns, observer

`Button` stores callbacks in `std::vector<std::function<void()>> handlers`. Write two member functions: `on_click` taking `std::function<void()> h` and appending it with `push_back(std::move(h))`, and `click()` calling every handler `h` in `handlers` with a range-for over `auto& h`.

```cpp
// starter
class Button {
    std::vector<std::function<void()>> handlers;
public:
    // your code here
};
```

```cpp
void on_click(std::function<void()> h) {
    handlers.push_back(std::move(h));
}
void click() {
    for (auto& h : handlers) h();
}
```

## exercise: Strategy via lambda
tags: patterns, strategy

Sort `v` (a `std::vector<int>`) in **descending** order using `std::sort` and a lambda taking `int a, int b`. One statement.

```cpp
std::sort(v.begin(), v.end(), [](int a, int b) { return a > b; });
```

## exercise: Builder with method chaining
tags: patterns, builder

Write the member function `title` for `QueryBuilder`: it takes `std::string t`, assigns it with `title_ = std::move(t);`, and returns `*this` by reference so calls chain.

```cpp
// starter
class QueryBuilder {
    std::string title_;
public:
    // your code here
};
```

```cpp
QueryBuilder& title(std::string t) {
    title_ = std::move(t);
    return *this;
}
```

## exercise: Visitor with std::variant
tags: patterns, visitor, variant

`v` is a `std::variant<int, std::string>`. Using `std::visit` and the `overloaded` idiom, return `x * 2` for an `int x` and `s.size()` for a `const std::string& s`. Assign the result to `auto n`.

```cpp
// starter
template<class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
```

```cpp
auto n = std::visit(overloaded{
    [](int x) { return x * 2; },
    [](const std::string& s) { return s.size(); }
}, v);
```

## exercise: CRTP base
tags: patterns, crtp, templates

Write a struct template `Printable` taking `class D`, with a member function `print() const` that streams the derived object to `std::cout` via `std::cout << static_cast<const D&>(*this);`.

```cpp
template <class D>
struct Printable {
    void print() const {
        std::cout << static_cast<const D&>(*this);
    }
};
```

## exercise: Scoped timer (RAII)
tags: raii, patterns

Write class `Timer`: constructor stores `std::chrono::steady_clock::now()` in member `start`; destructor computes `auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();` and prints it with `std::cout << ms << "ms\n";`.

```cpp
class Timer {
    std::chrono::steady_clock::time_point start;
public:
    Timer() : start(std::chrono::steady_clock::now()) {}
    ~Timer() {
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
        std::cout << ms << "ms\n";
    }
};
```

## exercise: Generic max
tags: templates, core

Write a function template `maxof` taking `class T` and two `const T&` parameters `a, b`, returning `const T&` — the larger of the two using `a < b ? b : a`.

```cpp
template <class T>
const T& maxof(const T& a, const T& b) {
    return a < b ? b : a;
}
```

## exercise: Move constructor
tags: move, core

`Buffer` owns `int* data` and `size_t n`. Write its move constructor: take `Buffer&& other` (noexcept), steal `data` and `n` via member-init list `data(other.data), n(other.n)`, then null out the source: `other.data = nullptr; other.n = 0;`.

```cpp
// starter
class Buffer {
    int* data; size_t n;
public:
    // your code here
};
```

```cpp
Buffer(Buffer&& other) noexcept : data(other.data), n(other.n) {
    other.data = nullptr;
    other.n = 0;
}
```
