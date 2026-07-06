# Exercises

Card format: `## exercise: Title`, optional `tags:`, prompt paragraphs, optional starter code as ```cpp block marked `// starter`, expected solution as the last ```cpp block that is neither starter nor harness. A final ```cpp block marked `// harness` (never displayed) is a complete C++20 program with a `//__USER__` marker: the backend injects the typed code there, compiles with g++ -std=c++20, runs it, and the drill passes when stdout is `PASS`. Checking ignores whitespace differences, so name things exactly as the prompt says.

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

```cpp
// harness
#include <cstdio>
class Config {
public:
    static Config& instance();
private:
    Config() = default;
};
//__USER__
int main() {
    if (&Config::instance() != &Config::instance()) return 1;
    std::puts("PASS");
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

```cpp
// harness
#include <cstdio>
//__USER__
int main() {
    { File f("/etc/hosts"); }
    std::puts("PASS");
}
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

```cpp
// harness
#include <cstdio>
#include <type_traits>
class Connection {
public:
//__USER__
};
static_assert(!std::is_copy_constructible_v<Connection>);
static_assert(!std::is_copy_assignable_v<Connection>);
int main() { std::puts("PASS"); }
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

```cpp
// harness
#include <memory>
#include <cstdio>
struct Shape { virtual ~Shape() = default; };
struct Circle : Shape { double r; explicit Circle(double r) : r(r) {} };
//__USER__
int main() {
    auto p = make_circle(2.5);
    if (!p) return 1;
    auto* c = dynamic_cast<Circle*>(p.get());
    if (!c || c->r != 2.5) return 1;
    std::puts("PASS");
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

```cpp
// harness
#include <vector>
#include <functional>
#include <cstdio>
class Button {
    std::vector<std::function<void()>> handlers;
public:
//__USER__
};
int main() {
    Button b;
    int n = 0;
    b.on_click([&] { ++n; });
    b.on_click([&] { n += 10; });
    b.click();
    if (n != 11) return 1;
    std::puts("PASS");
}
```

## exercise: Strategy via lambda
tags: patterns, strategy

Sort `v` (a `std::vector<int>`) in **descending** order using `std::sort` and a lambda taking `int a, int b`. One statement.

```cpp
std::sort(v.begin(), v.end(), [](int a, int b) { return a > b; });
```

```cpp
// harness
#include <algorithm>
#include <vector>
#include <cstdio>
int main() {
    std::vector<int> v = {3, 1, 4, 1, 5, 9, 2, 6};
//__USER__
    if (!std::is_sorted(v.begin(), v.end(), [](int a, int b) { return a > b; })) return 1;
    std::puts("PASS");
}
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

```cpp
// harness
#include <string>
#include <cstdio>
class QueryBuilder {
    std::string title_;
public:
//__USER__
    const std::string& get() const { return title_; }
};
int main() {
    QueryBuilder q;
    if (&q.title("a") != &q) return 1;
    q.title("x").title("y");
    if (q.get() != "y") return 1;
    std::puts("PASS");
}
```

## exercise: Visitor with std::variant
tags: patterns, visitor, variant

`v` is a `std::variant<int, std::string>`. Using `std::visit` and the `overloaded` idiom, return `std::size_t(x * 2)` for an `int x` and `s.size()` for a `const std::string& s` (both lambdas must return the same type — `std::visit` requires it). Assign the result to `auto n`.

```cpp
// starter
template<class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
```

```cpp
auto n = std::visit(overloaded{
    [](int x) { return std::size_t(x * 2); },
    [](const std::string& s) { return s.size(); }
}, v);
```

```cpp
// harness
#include <variant>
#include <string>
#include <cstdio>
template<class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
std::size_t run(std::variant<int, std::string> v) {
//__USER__
    return n;
}
int main() {
    if (run(21) != 42) return 1;
    if (run(std::string("hello")) != 5) return 1;
    std::puts("PASS");
}
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

```cpp
// harness
#include <iostream>
#include <sstream>
#include <cstdio>
//__USER__
struct Point : Printable<Point> {
    int x = 7;
};
std::ostream& operator<<(std::ostream& os, const Point& p) { return os << "P" << p.x; }
int main() {
    std::ostringstream out;
    auto* old = std::cout.rdbuf(out.rdbuf());
    Point{}.print();
    std::cout.rdbuf(old);
    if (out.str() != "P7") return 1;
    std::puts("PASS");
}
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

```cpp
// harness
#include <chrono>
#include <iostream>
#include <sstream>
#include <cstdio>
//__USER__
int main() {
    std::ostringstream out;
    auto* old = std::cout.rdbuf(out.rdbuf());
    { Timer t; }
    std::cout.rdbuf(old);
    auto s = out.str();
    if (s.size() < 4 || s.substr(s.size() - 3) != "ms\n") return 1;
    std::puts("PASS");
}
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

```cpp
// harness
#include <string>
#include <cstdio>
//__USER__
int main() {
    if (maxof(2, 3) != 3) return 1;
    if (maxof(std::string("apple"), std::string("banana")) != "banana") return 1;
    std::puts("PASS");
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

```cpp
// harness
#include <cstddef>
#include <cstdio>
#include <utility>
class Buffer {
public:
    int* data; size_t n;
    Buffer(size_t k) : data(new int[k]), n(k) {}
    ~Buffer() { delete[] data; }
//__USER__
};
int main() {
    Buffer a(5);
    int* p = a.data;
    Buffer b(std::move(a));
    if (b.data != p || b.n != 5) return 1;
    if (a.data != nullptr || a.n != 0) return 1;
    std::puts("PASS");
}
```
