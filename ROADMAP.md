# CORAL Roadmap

How to read this document:

- **No dates.** A date that slips becomes ammunition. Each phase ships when its
  checkable claims hold.
- **No price talk.** Nothing here is about what a token should be worth. It is
  about what the machine can prove it does.
- **Checkable over plausible.** Every "shipped" item below is verifiable —
  either in this repo, on the public reef, or on chain. Anything that cannot be
  checked is not claimed.

## Where the project actually stands

Shipped and verifiable today:

- Six-stage engine pass — observe → recall → reason → gate → execute → settle →
  evolve — with scored polyp recall against a local SQLite reef.
- LLM reasoning (Gemini) with deterministic heuristic fallback; the agent never
  stalls on a failed model call.
- Risk gate in code, not prompts: max notional per order, minimum confidence,
  circuit breaker after losing streaks. Paper mode is the default; live needs
  an explicit flag plus a second confirmation.
- On-chain reads and gated swap path on Robinhood Chain (4663) via the
  Chainbridge MCP; direct-signer sends for a dedicated wallet, proven with a
  live mainnet transaction.
- `coral api` — loopback HTTP surface, 16 endpoints — plus the public dApp and
  the frozen-reef snapshot at `coralagent.xyz/reef`.
- `coral backtest` — real historical bars through the real loop, with honest
  refusal when no history exists.
- Docker compose for the full local stack.

The honest gaps:

- The reef only grows when a human types a command. There is no scheduler.
- Equity market data is synthetic until the Robinhood Trading MCP token is
  supplied; on-chain quotes are real, equity bars are not.
- The live swap path is wired but has never executed — the operator wallet is
  unfunded and unregistered.
- The reef is young (generation 1). The memory is real; the track record is
  not yet long enough to mean anything.

## Phase 1 — Autonomy — shipped

The agent runs itself.

- `coral daemon` — a scheduler that runs the full pass on a cadence with no
  human trigger: scan the watchlist, settle matured decisions, evolve zones.
- Watchlist configuration — symbols and venues from a file, not a flag.
- Auto-publish — the public reef snapshot refreshes on a schedule, so what the
  site shows is always the reef the agent actually has.
- A status endpoint for uptime, last pass, and reef generation.

Why first: the core claim is *grows instead of resetting*. Until the reef
grows without someone typing, that claim is a tagline. After this phase it is
a fact anyone can watch happen.

## Phase 2 — Real data, better memory — partially shipped

- ~~Synthetic data ends.~~ Real daily OHLCV flows in from Yahoo today
  (`source: "yahoo"` on every observation). The Robinhood Trading MCP token
  upgrades this to broker-priced bars and live quotes — it needs the operator's
  OAuth, not more code.
- ~~Embedding recall~~ — shipped as Gemini embeddings blended beside the
  keyword scorer (`0.15·semantic` in the blend), so "similar setup" means
  semantically similar, not just shared words. Pure-JS cosine, no native
  dependency; polyps without an embedding score exactly as before.
- Cohort passes — already real: each daemon pass judges the whole watchlist
  (AAPL/MSFT/NVDA) in one structured call, so zones accumulate evidence per
  pass and cross-symbol patterns land in the same reef.

## Phase 3 — Evidence

- A track record page computed from the reef — hit rate, edge per zone,
  drawdown — derived from settled outcomes, never asserted by copy.
- Deeper replay — order-flow level backtesting, not just daily bars.
- Periodic snapshot audits — published, timestamped exports that let anyone
  diff the reef's state over time.

## Phase 4 — Access, and the first token utility

- A hosted read-only API for reef reads — token-gated, rate-limited, never
  exposing custody or execution.
- Visitor scans from the dApp — budget-capped so a crowd cannot burn the
  operator's LLM quota.
- npm packages once the API settles.
- `$CORAL` as the access token for the hosted surface — the first utility is
  functional: holding it is what lets a stranger query the reef. Nothing more
  ambitious than that until the track record exists to back it.

## Phase 5 — Utility that earns its complexity

Only after Phase 3 has produced a track record long enough to mean something:

- Governance over risk parameters — token-weighted votes on the gate's limits,
  with every change written to the reef as a polyp.
- Liquidity — created when there is a reason to hold beyond speculation.
- Fee share, if and only if the agent ever charges for anything.

## Explicitly out of scope

- Price targets, market-cap talk, or any statement about what `$CORAL` should
  trade at. The reef either keeps a better memory than you or it does not.
- Custody features. The signer key and the Oak keychain stay on the operator's
  machine. No phase moves them anywhere else.
- Backtest screenshots. If it is not reproducible from this repo or the public
  reef, it does not go on the site.
