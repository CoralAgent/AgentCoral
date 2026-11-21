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

- Broker-priced equity data is not flowing yet — the Robinhood Trading MCP
  token is the operator's OAuth to supply. Until then the reef reads real
  Yahoo daily bars; synthetic series remain only as a clearly-labelled
  per-symbol fallback.
- The live swap path is wired but has never executed — the operator wallet is
  unfunded and unregistered.
- The reef is young (generation 1). The memory is real; the track record is
  not yet long enough to mean anything — the evidence page says so itself.

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

## Phase 3 — Evidence — shipped

- The evidence page is live at `coralagent.xyz/evidence` — hit rate, edge per
  zone, drawdown, and confidence calibration, all computed at build time from
  settled polyps in the published snapshot. Zones with fewer than three
  decided polyps render as untested; a young reef gets an honest refusal
  instead of a percentage.
- Deeper replay — `coral backtest --intraday` replays hourly bars; tape-level
  order-flow replay remains open.
- Periodic snapshot audits — published, timestamped exports that let anyone
  diff the reef's state over time.

## Phase 4 — Broker-priced bars, and access

- Broker-priced bars shipped in code: Robinhood MCP historicals merge into
  `broker-series.json` on every pass — deduped by bar, timestamped, never
  silently dropped. The data starts flowing the day the operator supplies
  the OAuth token; until then the path refuses honestly rather than
  substituting a third-party feed.
- A hosted read-only API for reef reads — token-gated, rate-limited, never
  exposing custody or execution.
- Visitor scans from the dApp — budget-capped so a crowd cannot burn the
  operator's LLM quota.
- npm packages once the API settles.
- `$CORAL` as the access token for the hosted surface — the first utility is
  functional: holding it is what lets a stranger query the reef. Nothing more
  ambitious than that until the track record exists to back it.

## Phase 5 — Deep absolute mode, and utility that earns its complexity

The reef tends itself:

- Watchlist self-selection — shipped: every daemon pass re-derives the
  watchlist from the reef's own settled zone edges. Symbols whose polyps
  live in mature, above-neutral zones earn attention; unsettled polyps hold
  their symbol until the market grades it; the old config list survives
  only as a seed. A young reef refuses to choose and keeps its seed.
- Cadence that adapts — shipped: the daemon's next pass is chosen after
  every pass, from the reef's own state. Polyps past settlement age pull
  the wait to the floor — the reef owes the market a grade; a maturing
  polyp is visited the minute it can be graded; an active tape halves
  the wait; a quiet tape lengthens it. Bounded, deterministic, and
  logged with its reason.
- The hard lines stay hard: paper by default, the gate in code, everything on
  the public record.

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
