# Quant Probability Quizzes

Card format: a quiz heading, then `tags:` and `track:`, an optional setup line, exactly 4 options as `- [ ]` / `- [x]` (checked = correct), and a `> ` blockquote explanation showing the arithmetic.

## quiz: You pay a fixed price to roll one fair six-sided die and are paid its face value in dollars. What is the fair price?
tags: expected-value, dice
track: quant

- [ ] $3.00
- [x] $3.50
- [ ] $3.60
- [ ] $4.00

> The fair price is the expected payout: E = (1+2+3+4+5+6)/6 = 21/6 = 3.5. Pay more and you lose on average; pay less and you profit. The mean of a discrete uniform on {1..6} is the midpoint (1+6)/2 = 3.5.

## quiz: A fair coin is flipped until the first time you see two heads in a row (HH). What is the expected number of flips?
tags: expected-value, coin, markov
track: quant

- [ ] 4
- [x] 6
- [ ] 8
- [ ] 3

> Let a = expected flips from scratch, b = expected flips after just seeing one H. a = 1 + ½b + ½a and b = 1 + ½·0 + ½a. Substituting: b = 1 + a/2, so a = 1 + ½(1 + a/2) + a/2 = 3/2 + 3a/4, giving a/4 = 3/2 and a = 6. (The T-after-H resets you fully, which is what pushes it above the naive guess.)

## quiz: On average, which pattern appears first when flipping a fair coin: HH or HT?
tags: expected-value, coin, markov
track: quant

- [ ] HH — expected 4 flips vs 6 for HT
- [x] HT — expected 4 flips vs 6 for HH
- [ ] They tie — both take 4 flips
- [ ] They tie — both take 6 flips

> E[HT] = 4 but E[HH] = 6. For HT, once you get an H you can never "lose ground": any later T finishes you, and extra H's keep you primed. For HH, a T after your first H throws you all the way back to zero. Solving HT: a = 1 + ½b + ½a and b = 1 + ½·0 + ½b give b = 2, a = 4.

## quiz: You roll a fair six-sided die repeatedly. What is the expected number of rolls to see all six faces at least once?
tags: expected-value, coupon-collector, dice
track: quant

- [ ] 21
- [x] 14.7
- [ ] 6
- [ ] 12.25

> Coupon collector: after collecting k distinct faces, the wait for a new one is geometric with success (6−k)/6, so its expectation is 6/(6−k). Total = 6(1/6 + 1/5 + 1/4 + 1/3 + 1/2 + 1/1) = 6·(1+½+⅓+¼+⅕+⅙) = 6·2.45 = 14.7.

## quiz: X and Y are independent Uniform(0,1). What is E[max(X, Y)]?
tags: order-statistics, continuous, expected-value
track: quant

- [ ] 1/2
- [x] 2/3
- [ ] 3/4
- [ ] 1/3

> Let M = max(X,Y). Then P(M ≤ x) = P(X≤x)P(Y≤x) = x², so the density is 2x on (0,1). E[M] = ∫₀¹ x·2x dx = ∫₀¹ 2x² dx = 2/3. In general E[max of n iid U(0,1)] = n/(n+1); here n=2 gives 2/3.

## quiz: Two people agree to meet between 12:00 and 1:00, each arriving at a uniformly random time and waiting 15 minutes. What is the probability they actually meet?
tags: geometric-probability, continuous
track: quant

- [ ] 1/4
- [x] 7/16
- [ ] 9/16
- [ ] 1/2

> Scale the hour to [0,1]; 15 min = 1/4. They meet iff |x−y| ≤ 1/4. In the unit square the "miss" region is two right triangles with legs 3/4, total area 2·½·(3/4)² = (3/4)² = 9/16. So P(meet) = 1 − 9/16 = 7/16.

## quiz: In Monty Hall, you pick 1 of 3 doors, the host (who knows) opens a different door revealing a goat, then offers a switch. What is the probability of winning if you switch?
tags: conditional-probability, bayes
track: quant

- [ ] 1/2
- [x] 2/3
- [ ] 1/3
- [ ] 3/4

> Your first pick is right with probability 1/3 and wrong with 2/3. Switching wins exactly when your first pick was wrong, i.e. with probability 2/3. The host's reveal gives no new information about your original door but concentrates the remaining 2/3 onto the single unopened alternative.

## quiz: A family has two children. You learn at least one is a boy. What is the probability both are boys?
tags: conditional-probability, bayes
track: quant

- [ ] 1/2
- [x] 1/3
- [ ] 1/4
- [ ] 2/3

> Equally likely birth orders are {BB, BG, GB, GG}. Conditioning on "at least one boy" removes GG, leaving {BB, BG, GB}. Only BB has two boys, so the probability is 1/3. The tempting 1/2 forgets that BG and GB are two distinct outcomes.

## quiz: A disease affects 1% of people. A test is 99% sensitive (positive if diseased) and has a 5% false-positive rate. Given a positive test, what is the probability of disease?
tags: bayes, conditional-probability
track: quant

- [ ] 99%
- [x] About 17%
- [ ] 95%
- [ ] 50%

> Bayes: P(D|+) = P(+|D)P(D) / [P(+|D)P(D) + P(+|¬D)P(¬D)] = (0.99·0.01) / (0.99·0.01 + 0.05·0.99) = 0.0099 / (0.0099 + 0.0495) = 0.0099/0.0594 = 1/6 ≈ 16.7%. The rare base rate means most positives are false positives.

## quiz: What is the minimum number of people needed for a better-than-even chance that two share a birthday (365 equally likely days)?
tags: combinatorics, birthday
track: quant

- [x] 23
- [ ] 183
- [ ] 366
- [ ] 30

> Compare pairs, not days. P(all distinct) with n people = 365/365 · 364/365 · … · (365−n+1)/365. This drops below 1/2 first at n = 23 (P(all distinct) ≈ 0.493, so P(match) ≈ 0.507). 183 is the "half of 365" trap; 366 only guarantees a match (pigeonhole).

## quiz: You have $30 and your opponent $70. You repeatedly make fair $1 bets until one of you is broke. What is the probability you end up with all $100?
tags: gamblers-ruin, random-walk
track: quant

- [x] 0.30
- [ ] 0.50
- [ ] 0.70
- [ ] 0.09

> In a fair gambler's ruin, the probability of reaching the top before going broke equals your current fraction of the total wealth: 30/100 = 0.30. (The martingale/optional-stopping argument: your expected final wealth equals your starting $30 = 100·p + 0·(1−p), so p = 0.30.) 0.70 is the opponent's chance.

## quiz: You have $30, your opponent $70, fair $1 bets until someone is ruined. What is the expected number of bets until the game ends?
tags: gamblers-ruin, random-walk, expected-value
track: quant

- [ ] 100
- [ ] 210
- [ ] 1050
- [x] 2100

> For a symmetric random walk with absorbing barriers at 0 and N, starting from k, the expected number of steps is k·(N−k). Here k=30, N=100, so E = 30·70 = 2100. The variance-like product makes the game surprisingly long even though each step is tiny.

## quiz: You roll two fair dice repeatedly. What is the probability the sum is 6 before it is 7?
tags: probability, dice, race
track: quant

- [x] 5/11
- [ ] 5/6
- [ ] 6/11
- [ ] 1/2

> P(sum=6) = 5/36 and P(sum=7) = 6/36. Rolls that are neither just repeat, so condition on a decisive roll: P(6 before 7) = 5/(5+6) = 5/11. This is why "6" is a harder point than the more frequent 7.

## quiz: You roll a fair die until you get a 6. What is the expected number of rolls?
tags: geometric, expected-value, dice
track: quant

- [x] 6
- [ ] 3
- [ ] 5
- [ ] 1/6

> The number of trials to the first success is geometric with success probability p = 1/6, and its expectation is 1/p = 6. Note the answer is 6, not 5: E counts the successful roll itself (expected number of failures before success is 5).

## quiz: For the sum of two independent fair dice, which pair (mean, variance) is correct?
tags: expected-value, variance, dice
track: quant

- [ ] E = 7, Var = 35/12
- [x] E = 7, Var = 35/6
- [ ] E = 7, Var = 5.5
- [ ] E = 3.5, Var = 35/12

> Each die has mean 3.5, so the sum has E = 7. One die's variance is E[X²] − E[X]² = 91/6 − 49/4 = (182−147)/12 = 35/12. Variances of independent variables add, so Var(sum) = 2·35/12 = 35/6 ≈ 5.83. The trap answer 35/12 forgets to double it.

## quiz: If Z is a standard normal, what is E[|Z|]?
tags: continuous, normal, expected-value
track: quant

- [x] √(2/π) ≈ 0.80
- [ ] 0
- [ ] 1
- [ ] 2/π ≈ 0.64

> E[|Z|] = 2∫₀^∞ z·φ(z) dz where φ(z) = e^(−z²/2)/√(2π). The integral of z·e^(−z²/2) is 1, so E[|Z|] = 2/√(2π) = √(2/π) ≈ 0.7979. E[Z] = 0 by symmetry, but the absolute value has positive mean; √(Var) = 1 is a different quantity.

## quiz: An event has probability 25%. What are the fair odds (payout on a $1 stake) so that the bet has zero expected value?
tags: odds, no-arbitrage, expected-value
track: quant

- [x] 3-to-1 (win $3 profit, decimal 4.0)
- [ ] 4-to-1
- [ ] 1-to-3
- [ ] 2-to-1

> Fair odds against = (1−p)/p = 0.75/0.25 = 3, i.e. 3-to-1: you risk $1 to win $3 profit. Check the EV: 0.25·(+3) + 0.75·(−1) = 0.75 − 0.75 = 0. The 4-to-1 trap uses 1/p (the decimal odds) instead of (1−p)/p (the profit odds).

## quiz: A bookmaker prices both sides of a two-way market at decimal odds 1.90. What is the overround (the vig baked in)?
tags: odds, overround, vig, no-arbitrage
track: quant

- [ ] 0%
- [x] About 5.3%
- [ ] 10%
- [ ] 90%

> Decimal odds imply probability 1/odds. The two implied probabilities sum to 1/1.90 + 1/1.90 = 0.5263 + 0.5263 = 1.0526. The excess over 1.0 is the overround: ≈ 0.0526, or about 5.3%. Fair (0%) odds on a coin flip would be 2.00 each side.

## quiz: A fair coin is flipped until the first head. If the first head is on flip n, you are paid $2^n. What is the expected payout?
tags: st-petersburg, expected-value, variance
track: quant

- [x] Infinite (the sum diverges)
- [ ] $2
- [ ] $4
- [ ] Undefined / no answer

> The first head lands on flip n with probability (1/2)^n, paying $2^n. Expected payout = Σₙ (1/2)^n · 2^n = Σₙ 1 = 1 + 1 + 1 + … = ∞. The St. Petersburg paradox: EV is infinite yet nobody pays a large finite entry fee, because the variance is enormous and huge payoffs are astronomically rare.

## quiz: You draw two cards from a well-shuffled 52-card deck. What is the probability they form a pair (same rank)?
tags: combinatorics, cards, probability
track: quant

- [x] 1/17
- [ ] 1/13
- [ ] 3/52
- [ ] 1/169

> The first card can be anything. Of the 51 remaining cards, exactly 3 share its rank, so P(match) = 3/51 = 1/17 ≈ 0.0588. The 1/13 trap forgets one card of that rank was already removed; 1/169 wrongly treats the draws as independent with replacement.

## quiz: In the two-envelope problem, one envelope holds twice the other. After picking one, the "always switch" argument computes ½(2x)+½(x/2)=1.25x. Why is it flawed?
tags: paradox, expected-value, conditional-probability
track: quant

- [ ] Switching genuinely earns a 25% expected gain
- [x] It reuses one symbol x for two different amounts, so the two branches aren't a valid expectation; by symmetry switching gains nothing
- [ ] You should therefore never switch
- [ ] The envelopes must contain equal amounts

> The calculation lets "x" mean your envelope's amount, but in the branch where you hold the larger sum, the other envelope is x/2, and in the branch where you hold the smaller, it is 2x — different underlying totals. With no proper prior over the amounts, the branches can't be averaged that way, and by symmetry either envelope is equally good: expected gain from switching is 0.

## quiz: Continue the sequence: 2, 3, 5, 7, 11, 13, ?
tags: sequences, pattern
track: quant

- [x] 17
- [ ] 15
- [ ] 19
- [ ] 16

> These are the prime numbers in order: 2, 3, 5, 7, 11, 13, and the next prime is 17. 15 = 3·5 is composite (the "+2" trap), and 19 skips over 17.

## quiz: Continue the look-and-say sequence: 1, 11, 21, 1211, 111221, ?
tags: sequences, pattern
track: quant

- [x] 312211
- [ ] 13112221
- [ ] 122121
- [ ] 21112211

> Each term describes the previous one by counts of digits. "111221" reads as three 1s, two 2s, one 1 → "3 1, 2 2, 1 1" → 312211. (13112221 is the term after that; the others don't match any consistent reading.)

## quiz: Why do market makers widen their bid-ask spread when they suspect informed traders are present?
tags: market-making, adverse-selection
track: quant

- [x] Informed traders trade only when it favors them (against the maker), so the maker loses on those fills; a wider spread offsets this adverse selection
- [ ] Informed traders pay higher commissions, so wider spreads collect more fees
- [ ] Wider spreads reduce the asset's volatility
- [ ] Exchange rules require wider spreads during informed flow

> A market maker earns the half-spread from uninformed (noise) flow but systematically loses to informed traders, who buy just before prices rise and sell just before they fall. To break even overall, the spread must be wide enough that gains from noise flow cover losses to informed flow — the core Glosten-Milgrom adverse-selection insight.

## quiz: You quote bid $49.90 / ask $50.10 on a stock whose fair value is exactly $50.00. All order flow is uninformed and hits your bid or ask with equal probability. What is your expected profit per trade?
tags: market-making, expected-value, spread
track: quant

- [x] $0.10
- [ ] $0.20
- [ ] $0.05
- [ ] $0.00

> With uninformed flow you capture the half-spread on every fill. If they sell to you, you buy at $49.90 (fair $50.00) → +$0.10; if they buy, you sell at $50.10 → +$0.10. Expected profit = ½·0.10 + ½·0.10 = $0.10, exactly half the $0.20 spread. The full spread $0.20 is earned only across a round-trip (one buy and one sell).

## quiz: Let X be a fair die and Z an independent fair die, and set Y = X + Z. What is Cov(X, Y)?
tags: covariance, variance, dice
track: quant

- [x] 35/12
- [ ] 0
- [ ] 35/6
- [ ] 7

> Cov(X, Y) = Cov(X, X+Z) = Cov(X, X) + Cov(X, Z) = Var(X) + 0, since X and Z are independent. Var(X) for one fair die = 35/12 ≈ 2.92. It is not 0 (X and Y move together through the shared X) and not Var(Y) = 35/6.
