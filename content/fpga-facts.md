# FPGA Facts

FPGA fundamentals for a C++ engineer, and why high-frequency trading reaches for hardware. Each card has a heading, a `tags:` line, a `track: fpga` line, body markdown, and an optional single ```verilog or ```cpp block. Every card carries `track: fpga` to drive the FPGA study filter.

## fact: An FPGA is a chip you rewire, not one you program
tags: fundamentals, hardware
track: fpga

An **FPGA** (Field-Programmable Gate Array) is a sea of digital logic you configure *after* manufacturing. Rather than executing instructions like a CPU, you describe a circuit and load a **bitstream** that makes the chip physically become that circuit. The primitives are **LUTs** (look-up tables) that implement any Boolean function of their inputs, **flip-flops** that each store one bit, and a programmable **routing fabric** of wires connecting them. Vendors group these into **CLBs** (Configurable Logic Blocks; Intel/Altera calls them LABs); a modern LUT typically has 6 inputs backed by a 64-entry truth-table SRAM.

Two kinds of hardened blocks round out the fabric. **BRAM** (Block RAM) is dedicated dual-port memory — kilobits per block, thousands of blocks per device — for buffers, FIFOs, and tables. **DSP slices** are hardened multiply-accumulate units (Xilinx calls them DSP48) that do fixed-point arithmetic far more efficiently than logic built from LUTs.

Every design is a **budget** across four resources — LUTs, flip-flops, BRAM, and DSPs. Exhaust any one and the design won't fit, even if the others sit idle.

## fact: FPGA vs ASIC vs CPU — the reconfigurable middle ground
tags: fundamentals, tradeoffs
track: fpga

A **CPU** is fully general but executes instructions sequentially over a shared datapath — flexible, but high-latency and subject to caches, branch prediction, and OS jitter. An **ASIC** is a fully custom chip: fastest and most power-efficient, but a multi-million-dollar, multi-month tape-out that can never be changed once made.

An **FPGA** sits between them. You get hardware parallelism and near-ASIC latency, yet the fabric is **reconfigurable** in seconds by loading a new bitstream. You pay for that flexibility in clock speed (FPGAs run at hundreds of MHz, not GHz), silicon area, and power. For HFT the payoff is doing the work as a fixed circuit instead of a stream of instructions.

## fact: HDL describes hardware — everything runs in parallel
tags: hdl, mindset
track: fpga

**Verilog** and **VHDL** are hardware *description* languages, not programming languages. When you write two `always` blocks or two `assign` statements they do not run one after another — they become two independent circuits that operate **simultaneously, every clock cycle**. There is no program counter and no "next line."

This is the hardest shift for a software engineer. Ordering in the source text is largely irrelevant; what matters is the data-flow graph you are describing. Concurrency isn't something you add — it is the default, and forcing work to happen *in sequence* (via a state machine) is the extra effort.

## fact: Combinational vs sequential logic
tags: hdl, fundamentals
track: fpga

**Combinational logic** is a pure function of its current inputs — LUTs computing an output with no memory. In Verilog it's an `assign` or an `always @(*)` block, and its cost is propagation delay as signals ripple through gates.

**Sequential logic** holds state that updates on a clock edge, built from flip-flops. `always @(posedge clk)` describes registers that capture their inputs once per rising edge and hold them until the next. Real designs alternate: combinational logic computes, a register latches the result, the next stage computes from there.

## fact: Blocking `=` vs non-blocking `<=` — the classic Verilog trap
tags: hdl, verilog, gotcha
track: fpga

The rule that prevents a whole class of bugs: use **non-blocking `<=` in clocked (sequential) blocks**, and **blocking `=` in combinational blocks**. Non-blocking assignments all sample their right-hand sides first, then update together at the edge — exactly how real flip-flops behave.

```verilog
// Sequential: a 2-stage shift register. Non-blocking is required.
always @(posedge clk) begin
    q1 <= d;
    q2 <= q1;   // sees the OLD q1, so this is a true 2-stage delay
end

// Combinational: blocking, so each line sees the previous result.
always @(*) begin
    x = a & b;
    y = x | c;  // uses the x computed on the line above
end
```

Swap them and the shift register collapses into a single stage, and you can get a design that simulates one way but synthesizes another.

## fact: The clock, Fmax, and the critical path
tags: timing, fundamentals
track: fpga

Synchronous designs march to a **clock**. Between any two registers sits combinational logic with some propagation delay; the **critical path** is the slowest such path in the entire design. The clock period must exceed that delay (plus setup time), so the critical path sets the maximum clock frequency, **Fmax** — one long path can cap the whole chip's speed.

**Timing closure** is the iterative work of getting a design to meet its target clock: restructuring logic, adding pipeline registers, guiding placement, until the tools report no negative slack.

## fact: Setup time, hold time, and metastability
tags: timing, fundamentals
track: fpga

A flip-flop only captures data reliably if its input is stable in a window around the clock edge. **Setup time** is how long data must be steady *before* the edge; **hold time** is how long it must stay steady *after*. Violate either and the flop can go **metastable** — its output hovers in an undefined state and resolves at an unpredictable time.

Setup violations are fixed by slowing the clock or shortening the path (more pipelining). Hold violations are nastier: they don't improve with a slower clock because the offending path is too *short* relative to clock skew, so the place-and-route tool must add delay.

## fact: Synchronous vs asynchronous reset
tags: timing, reset
track: fpga

A **synchronous reset** only takes effect on a clock edge (`if (rst) ...` inside `always @(posedge clk)`), so it is just another input to the logic — easy to time, but it needs a running clock. An **asynchronous reset** acts immediately (`always @(posedge clk or posedge rst)`), independent of the clock.

The subtle danger is reset *de-assertion*: if an async reset releases too close to a clock edge, flops can go metastable. The common practice is "**asynchronous assert, synchronous de-assert**" via a reset synchronizer. Many FPGA teams prefer synchronous resets outright for simpler timing.

## fact: Clock-domain crossing and the 2-FF synchronizer
tags: cdc, timing, gotcha
track: fpga

When a signal passes from one clock domain to another, the receiving flop can sample it mid-transition and go **metastable**. For a **single-bit** signal the standard fix is a **two-flip-flop synchronizer**: two registers in series in the destination domain. The first may go metastable but almost always settles before the second samples it, driving the failure rate astronomically low.

```verilog
always @(posedge clk_dst) begin
    sync0 <= async_in;   // may be metastable
    sync1 <= sync0;      // settled by now; safe to use downstream
end
```

A 2-FF synchronizer only works for one bit at a time. **Multi-bit** buses need Gray coding (for counters), a request/acknowledge handshake, or an asynchronous FIFO — otherwise the bits arrive skewed and you latch a value that never actually existed.

## fact: Pipelining and replication — the FPGA's parallelism
tags: pipelining, parallelism, timing
track: fpga

**Pipelining** breaks a long combinational path into stages separated by registers. Each stage is shorter, so the clock can run faster (higher **Fmax**), and once full the pipeline emits a result **every cycle**. The price is **latency** — a result now takes N cycles to cross N stages — but throughput soars.

The other axis is **spatial parallelism**: **unrolling** a loop into replicated hardware and **replicating** whole datapaths so N things happen physically at once instead of N times in sequence. A CPU at 4 GHz still runs only a few instructions per cycle over one shared ALU, with jitter from branches and cache misses; a 300 MHz FPGA can lay **hundreds of operations side by side**, all firing each cycle with identical latency. For a wide, fixed computation the lower clock simply doesn't matter.

## fact: Latency vs throughput and the initiation interval
tags: pipelining, fundamentals
track: fpga

**Latency** is how long one item takes end to end; **throughput** is how many items complete per unit time. Pipelining trades a little latency for a lot of throughput. In HFT you care about both, but tick-to-trade is fundamentally a **latency** game — one message in, one order out, as fast as possible.

The **initiation interval (II)** is the number of clock cycles between accepting consecutive inputs. **II = 1** means the pipeline swallows a new input every cycle — the ideal. II > 1 means the hardware stalls between inputs, usually because of a resource or dependency that can't be shared fast enough.

## fact: Finite state machines and one-hot encoding
tags: fsm, design
track: fpga

Whenever hardware must do things *in sequence* — a handshake, a protocol, a multi-step decode — you build a **finite state machine**: a state register plus combinational next-state and output logic. FSMs are how you reintroduce ordering into an inherently parallel fabric.

**One-hot encoding** gives each state its own flip-flop, with exactly one asserted at a time. It burns more registers than binary encoding (which would use `log2(N)` bits for N states) but makes next-state and decode logic trivial and fast — and FPGAs have flip-flops in abundance, so one-hot is often the default for speed.

## fact: Fixed-point is cheap, floating-point is expensive
tags: arithmetic, dsp
track: fpga

On an FPGA, **fixed-point** integer arithmetic maps directly onto LUTs, carry chains, and **DSP slices** — fast and compact. **Floating-point** must build exponent handling, normalization, and rounding out of that same fabric, costing many more resources and adding pipeline latency to every operation.

HFT designs stay in fixed-point wherever possible: prices and quantities are integers or scaled integers anyway. A DSP slice does a wide fixed-point multiply-accumulate in a cycle or two; the same in float might need a dozen stages. Choose bit widths deliberately — every bit is real silicon.

## fact: BRAM vs registers vs distributed RAM
tags: memory, resources
track: fpga

Three ways to store data, each with a tradeoff. **Flip-flops/registers** hold small amounts of state you touch every cycle — fully parallel but expensive per bit. **Distributed RAM** repurposes LUTs into small memories, handy for tiny tables close to the logic. **BRAM** is dedicated dual-port memory for larger buffers, FIFOs, and lookup tables.

Rule of thumb: a few bits, always live → registers; a few hundred entries → distributed RAM; kilobits and up → BRAM. Pick wrong and you either waste scarce resources or create a bottleneck. BRAM is dual-port, so at most two independent accesses per cycle — need more and you must replicate or bank it.

## fact: The toolchain — synthesis, place-and-route, bitstream
tags: toolchain, workflow
track: fpga

Getting from HDL to a running chip is a pipeline of tools. **Synthesis** turns your Verilog into a netlist of LUTs, flops, and hardened blocks. **Place-and-route** decides which physical LUT each piece lands in and threads the routing between them. **Static timing analysis** then checks every path against the clock. Finally a **bitstream** is generated and loaded onto the device.

The dominant tools are **AMD/Xilinx Vivado** and **Intel/Altera Quartus**. The pain point: builds are slow — place-and-route on a large design can take **hours**, and a one-line change means another full run. The edit-compile-test loop is nothing like software's.

## fact: HLS — writing C++ that becomes hardware
tags: hls, workflow
track: fpga

**High-Level Synthesis** lets you write C or C++ and have the tool generate RTL. You annotate the code with pragmas to steer the hardware: `#pragma HLS pipeline` to pipeline a loop toward II=1, `#pragma HLS unroll` to replicate a loop body, `#pragma HLS array_partition` to split an array across BRAMs for parallel access.

```cpp
void mac(const int a[8], const int b[8], int& acc) {
#pragma HLS pipeline II=1
    int sum = 0;
    for (int i = 0; i < 8; ++i) {
#pragma HLS unroll
        sum += a[i] * b[i];   // 8 parallel multiplies
    }
    acc = sum;
}
```

HLS shortens development and lets software engineers contribute, but it hides the hardware: for the tightest latency hand-written RTL usually still wins, and you must understand the generated circuit to hit II=1 and close timing.

## fact: Testbenches and simulation come before hardware
tags: verification, workflow
track: fpga

You never debug on the chip first. A **testbench** is HDL (or C++) that drives stimulus into your design and checks its outputs in a **simulator** — Verilator, ModelSim/Questa, or Vivado's built-in simulator. Simulation gives full visibility into every signal on every cycle, which real silicon cannot, and it avoids the hours-long place-and-route build you'd pay just to observe a bug.

Because hardware bugs are so expensive to iterate on, verification often takes more effort than the design itself. HFT teams simulate against captured real market data to prove a parser or strategy is bit-exact before it ever touches the fabric.

## fact: Tick-to-trade in nanoseconds, deterministically
tags: hft, latency, determinism
track: fpga

**Tick-to-trade** is the time from a market-data packet arriving to an order leaving the wire. A tuned software stack — even with kernel bypass — lands in the **single-digit microseconds**. An FPGA doing the same path as a circuit lands in **tens to low hundreds of nanoseconds**, often about an order of magnitude faster.

Just as important as the mean is the **determinism**: no OS scheduler, no cache misses, no garbage collection, no interrupts. Every message takes the *same* number of clock cycles. In trading, the latency tail is what gets you picked off, so a predictable 200 ns can beat an average 1 µs that occasionally spikes to 50 µs.

## fact: FPGAs sit inline on the wire, often on the NIC
tags: hft, architecture
track: fpga

The lowest-latency designs put the FPGA **inline with the network** — frequently on a smart **NIC** so packets hit the fabric the instant they arrive, before any host CPU is involved. The FPGA parses the market-data feed, evaluates logic, and can emit an order **wire-to-wire** without a round trip to software.

Typical hardware functions in the fast path are **feed handlers** that decode and normalize market data, **pre-trade risk checks**, and **order entry**. Slower, more complex logic — strategy calibration, position management — stays in software on the host, which parameterizes or reconfigures the FPGA. This split of a hardware fast path and a software slow path is the standard HFT architecture.

## fact: Kernel bypass vs full hardware
tags: hft, latency, architecture
track: fpga

**Kernel bypass** (Solarflare Onload, DPDK) removes the OS network stack from the path, delivering packets straight to userspace. It cuts latency dramatically versus ordinary sockets, but the logic still runs as software on a CPU — so jitter and single-digit-microsecond latency remain.

**Full hardware** goes further: parsing, decision, and order generation happen entirely in the FPGA, and a matching packet can trigger an outbound order without a CPU ever touching it. Bypass is easier to build and change; full hardware is the choice when every nanosecond and the latency tail matter most. Many shops run both — hardware for the hot path, bypass for everything else.

## fact: Parsing market data and A/B line arbitration in hardware
tags: hft, feed-handler, protocols
track: fpga

Exchange feeds are usually **fixed-layout binary** messages (many use FIX/FAST or SBE-style encodings). Fixed fields at known offsets are ideal for hardware: a pipeline pulls price, size, and sequence number out of each message with combinational field extraction, a new message per clock.

Exchanges also send two identical multicast feeds, **A and B**, for redundancy. **Line arbitration** logic takes whichever copy of each sequence number arrives first and drops the duplicate, so a packet lost on one feed is recovered from the other with no added latency. Doing this in the FPGA keeps recovery entirely off the software critical path.

## fact: Pre-trade risk checks in the fast path
tags: hft, risk
track: fpga

Regulation and prudence require every outbound order to pass **pre-trade risk** limits — max order size, price bands, per-symbol and aggregate position caps, message-rate throttles. In a software system these checks add microseconds; in hardware they are a handful of comparators the order flows through in a couple of clock cycles.

Putting the risk gate **in the FPGA** makes it unconditional and deterministic — no order can escape to the exchange without passing it, and it costs almost no latency. It is one of the cases where hardware buys you both safety and speed instead of trading one for the other.

## fact: The FPGA-vs-software tradeoff is real
tags: hft, tradeoffs
track: fpga

FPGAs are not free speed. Development is slow and specialized: HDL expertise is scarce, builds take hours, debugging is harder than software, and changing a strategy can mean re-synthesizing and re-timing the whole design. Software iterates in seconds; FPGA turnarounds are measured in hours to days.

So the decision is economic, not just technical. Put in **hardware** what pays for itself in latency and determinism — the innermost tick-to-trade loop, feed handling, risk gates — and keep in **software** whatever needs flexibility: research, calibration, and less latency-critical strategies. The winning systems are hybrids that place each piece where it belongs.

## fact: The HFT FPGA ecosystem
tags: hft, vendors
track: fpga

The dominant FPGA vendors are **AMD/Xilinx** (UltraScale+ family, Alveo accelerator cards) and **Intel/Altera** (Stratix, Agilex). Low-latency **NICs** historically came from **Solarflare** (now part of AMD) and are common both for kernel bypass and as FPGA-NIC platforms. On the network side, **Arista** — including the former Exablaze/Metamako lines — builds ultra-low-latency switches, some with an FPGA layer for inline logic.

Toolwise you'll live in **Vivado** (Xilinx) or **Quartus** (Intel). Exact latency figures are vendor- and design-specific and worth measuring yourself rather than trusting a datasheet headline — but the vendors above are what most HFT hardware is built on.
