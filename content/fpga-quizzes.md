# FPGA Quizzes

Multiple-choice cards on FPGA internals and low-latency trading. Each card has a heading, a `tags:` line, a `track: fpga` line, an optional ```verilog or ```cpp block, exactly four options as `- [ ]` / `- [x]` (checked = correct), and a `> ` blockquote explanation. Every card carries `track: fpga`.

## quiz: How does an FPGA fundamentally differ from a CPU?
tags: fundamentals, hardware
track: fpga

- [ ] It runs the same machine instructions but at a much higher clock
- [x] You configure it into a physical circuit; logic runs in parallel rather than as a stream of sequential instructions
- [ ] It is a fixed custom chip that cannot be changed after manufacturing
- [ ] It is a GPU specialized for floating-point math

> An FPGA is reconfigurable fabric that *becomes* your circuit. A CPU executes instructions sequentially; a fixed custom chip is an ASIC; the float specialist is a GPU. FPGAs run slower clocks (hundreds of MHz) but win through spatial parallelism and determinism.

## quiz: What is wrong with this clocked block?
tags: hdl, verilog, gotcha
track: fpga

```verilog
always @(posedge clk) begin
    b = a;   // blocking
    c = b;   // blocking
end
```

- [ ] Nothing — blocking assignments are correct in clocked blocks
- [x] Sequential logic should use non-blocking `<=`; with blocking `=`, `c` sees the new `b` immediately, collapsing an intended 2-stage path into one and risking sim/synth mismatch
- [ ] It creates a combinational feedback loop
- [ ] `b` and `c` will hold values from two different clocks

> In a `posedge clk` block, use non-blocking `<=` so every right-hand side samples the *old* values and all registers update together — modeling real flip-flops. With blocking `=`, `c = b` uses the `b` just assigned this line, so both `b` and `c` end up equal to `a` and the intended two-register delay disappears. Blocking `=` belongs in combinational (`always @(*)`) blocks.

## quiz: A single-bit control signal crosses from clk_a into clk_b. What is the standard safe technique?
tags: cdc, timing
track: fpga

- [ ] Register it once in clk_b
- [x] Pass it through two chained flip-flops in the clk_b domain (a 2-FF synchronizer)
- [ ] Combinationally AND it with clk_b
- [ ] Nothing special is needed as long as both clocks are the same frequency

> A single register can latch a metastable value and pass it downstream. Two chained flops give the first time to settle before the second samples, pushing the failure probability astronomically low. Equal frequency doesn't help unless the clocks are also phase-aligned. Multi-bit buses need Gray coding, a handshake, or an async FIFO instead.

## quiz: What is metastability?
tags: timing, fundamentals
track: fpga

- [ ] A design that consumes too many DSP slices
- [ ] A permanent stuck-at fault inside a flip-flop
- [x] A flip-flop output hovering in an undefined state after a setup/hold violation, resolving to 0 or 1 at an unpredictable time
- [ ] Two clock domains that happen to run at the same frequency

> When data changes too close to a clock edge (violating setup or hold), the flop can enter a metastable state and take an unbounded time to settle. It is the core hazard at clock-domain crossings and is mitigated with synchronizers, not eliminated outright.

## quiz: Your design fails timing — the critical path is too long for the target clock. Which change most directly helps?
tags: timing, pipelining
track: fpga

- [ ] Switch every assignment from non-blocking to blocking
- [x] Insert pipeline registers to split the long combinational path into shorter stages
- [ ] Change the reset from synchronous to asynchronous
- [ ] Move the logic into BRAM

> Registering intermediate results shortens the longest combinational path, raising Fmax — at the cost of extra latency cycles. Assignment style and reset type don't change path delay, and BRAM is memory, not a place to "put logic."

## quiz: In a pipelined loop, an initiation interval (II) of 1 means:
tags: pipelining, fundamentals
track: fpga

- [ ] The loop body executes exactly once
- [ ] Each result has a total latency of one cycle
- [x] The pipeline accepts a new input every clock cycle
- [ ] The clock is divided by one

> II is the number of cycles between accepting consecutive inputs. II=1 is ideal throughput — one new item per cycle — regardless of how many cycles of latency each item needs to traverse the whole pipeline. II>1 means the pipeline stalls between inputs.

## quiz: Which statement about these two lines is correct?
tags: hdl, fundamentals
track: fpga

```verilog
assign y = a & b;
always @(posedge clk) q <= d;
```

- [x] `y` is combinational (tracks a and b continuously); `q` is sequential (updates only on the clock edge)
- [ ] Both are sequential because they sit in the same module
- [ ] `y` is sequential because `assign` is a stateful construct
- [ ] `q` is combinational because it has no reset

> `assign` describes combinational logic with no memory — its output follows its inputs continuously. The `always @(posedge clk)` block infers a flip-flop that captures `d` once per rising edge. Whether a reset exists has nothing to do with combinational vs sequential.

## quiz: In a one-hot encoded FSM with 8 states, how many state flip-flops are used and how many are high at once?
tags: fsm, design
track: fpga

- [ ] 3 flip-flops, 1 high
- [x] 8 flip-flops, exactly 1 high
- [ ] 8 flip-flops, all high
- [ ] 3 flip-flops, all high

> One-hot uses one flip-flop per state with exactly one asserted at a time. It costs more registers than binary encoding (which would use 3 bits for 8 states) but yields simpler, faster next-state and decode logic — a good trade on FPGAs, which have flip-flops to spare.

## quiz: Why do HFT FPGA designs favor fixed-point over floating-point arithmetic?
tags: arithmetic, dsp
track: fpga

- [ ] Floating-point cannot be represented in hardware at all
- [x] Floating-point costs far more LUTs/DSPs and adds pipeline latency; fixed-point maps directly onto DSP slices
- [ ] Fixed-point is strictly more accurate than floating-point in every case
- [ ] FPGAs are unable to perform multiplication

> Float requires exponent handling, normalization, and rounding built from fabric, costing resources and latency per operation. Prices and sizes are integers anyway, so scaled fixed-point runs in a DSP slice in a cycle or two. It's a cost/latency argument, not accuracy — and FPGAs multiply just fine (that's what DSP slices do).

## quiz: You need a 4096-entry lookup table read once per cycle. Which resource fits best?
tags: memory, resources
track: fpga

- [ ] Flip-flops (registers)
- [x] BRAM (block RAM)
- [ ] A single LUT
- [ ] DSP slices

> Thousands of entries belong in dedicated BRAM, which is sized for kilobits and up. Holding 4096 entries in flip-flops would burn enormous register and routing resources; a single LUT stores only a tiny truth table; DSP slices do arithmetic, not general storage. (BRAM is dual-port, so up to two reads per cycle.)

## quiz: What does `#pragma HLS pipeline II=1` request in this HLS loop?
tags: hls, workflow
track: fpga

```cpp
for (int i = 0; i < N; ++i) {
#pragma HLS pipeline II=1
    out[i] = f(in[i]);
}
```

- [ ] Run the loop on the host CPU instead of the FPGA
- [x] Generate hardware that starts a new loop iteration every clock cycle
- [ ] Replicate the loop body into N fully parallel copies
- [ ] Store `out` in floating-point format

> `pipeline II=1` asks HLS to build a pipelined datapath that accepts a new iteration each cycle. Full spatial replication is `#pragma HLS unroll` — a different transformation (though the two can combine). The pragma says nothing about numeric type or where the code runs.

## quiz: Roughly, tick-to-trade latency for a tuned FPGA path vs a kernel-bypass software path is:
tags: hft, latency
track: fpga

- [ ] Both are in the millisecond range
- [ ] FPGA in microseconds, software in milliseconds
- [x] FPGA in tens-to-hundreds of nanoseconds, software in single-digit microseconds
- [ ] FPGA in picoseconds, software in nanoseconds

> A hardware path processes the message as a circuit in tens to low hundreds of nanoseconds; even kernel-bypass software sits in the single-digit-microsecond range — roughly an order of magnitude apart. Picosecond tick-to-trade isn't real, and milliseconds are far too slow to compete.

## quiz: Beyond raw average speed, why do HFT firms value FPGAs for the fast path?
tags: hft, determinism
track: fpga

- [ ] They consume less electricity than any CPU
- [x] Deterministic latency — no OS scheduler, cache misses, or GC, so every message takes the same number of cycles, keeping the tail tight
- [ ] They can execute arbitrary Python at line rate
- [ ] They never need to be reprogrammed once deployed

> The latency tail is what gets you picked off. An FPGA circuit takes an identical cycle count per message — no jitter from interrupts, caches, or garbage collection. A predictable 200 ns can beat an average 1 µs that spikes to 50 µs. Power isn't the driver, and FPGAs don't run Python.

## quiz: What distinguishes "full hardware" tick-to-trade from kernel bypass?
tags: hft, architecture
track: fpga

- [ ] Kernel bypass runs the entire strategy inside the OS kernel
- [x] In full hardware the FPGA parses, decides, and emits the order with no CPU in the path; kernel bypass still runs the logic as software in userspace
- [ ] They are two names for the same technique
- [ ] Full hardware is slower but much easier to modify

> Kernel bypass (Onload, DPDK) skips the OS network stack, but the strategy still runs on a CPU. Full hardware keeps the entire hot path inside the FPGA, so a matching packet can trigger an order without a CPU touching it — faster and more deterministic, but harder to change.

## quiz: Exchanges send identical A and B multicast feeds. What does line-arbitration logic do?
tags: hft, feed-handler
track: fpga

- [ ] Load-balances outbound orders across two exchanges
- [x] Takes whichever copy of each sequence number arrives first and drops the duplicate, recovering packets lost on one feed
- [ ] Encrypts the market-data stream before parsing
- [ ] Doubles the rate at which orders can be sent

> A and B are redundant copies of the same feed. Arbitration deduplicates by sequence number and uses the earlier arrival, so a drop on one feed is covered by the other with no added latency. Doing it in the FPGA keeps recovery off the software critical path.

## quiz: Why put pre-trade risk checks (size, price, position limits) inside the FPGA?
tags: hft, risk
track: fpga

- [ ] Because running risk checks in software is illegal
- [x] They become a few comparators the order passes in a couple of cycles — unconditional and deterministic, with almost no latency cost
- [ ] Because an FPGA physically cannot send an order without them
- [ ] To let each order opt out of the checks individually

> Hardware risk gates are cheap (just comparators) and guarantee no order reaches the exchange without passing — safety and speed together, unlike software checks that add microseconds. They are mandatory, not opt-out, and software risk systems are perfectly legal and common too.

## quiz: How do a CPU, an FPGA, and an ASIC compare on flexibility and latency?
tags: fundamentals, tradeoffs
track: fpga

- [ ] An ASIC is the most flexible; a CPU the least
- [x] The CPU is most flexible but has the highest latency/jitter; the FPGA is reconfigurable with near-ASIC latency; the ASIC is least flexible with the lowest latency
- [ ] FPGA and ASIC are equally reconfigurable after manufacturing
- [ ] The CPU has the lowest latency of the three

> CPUs are fully general but pay instruction-stream and OS overhead. FPGAs are reconfigurable in seconds and get hardware parallelism and low latency. ASICs are fixed at tape-out — best latency and power, zero flexibility. An ASIC cannot be reconfigured the way an FPGA can.

## quiz: A 300 MHz FPGA can beat a 4 GHz CPU on a fixed feed-parsing pipeline mainly because:
tags: parallelism, tradeoffs
track: fpga

- [ ] Its clock is actually faster than the CPU's
- [x] It lays hundreds of operations physically side by side, all firing every cycle with constant latency — spatial parallelism beats the CPU's shared, sequential datapath
- [ ] It has a much larger cache than the CPU
- [ ] It uses floating-point where the CPU is stuck with integers

> Despite the lower clock, the FPGA does in one cycle what a CPU needs many sequential instructions for, and every message takes the same time. The advantage is spatial parallelism and determinism, not clock speed, cache size, or numeric type.
