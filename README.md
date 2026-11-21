<div align="center">

```
   ██████╗ ██████╗ ██████╗  █████╗ ██╗
  ██╔════╝██╔═══██╗██╔══██╗██╔══██╗██║
  ██║     ██║   ██║██████╔╝███████║██║
  ██║     ██║   ██║██╔══██╗██╔══██║██║
  ╚██████╗╚██████╔╝██║  ██║██║  ██║███████╗
   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
```

**Cultivating On-chain Reasoning & Adaptive Learning**

*Growing intelligence, one decision at a time.*

A self-evolving trading agent that grows a reef of memory from every decision it makes.

[Quick start](#quick-start) · [How it works](#how-it-works) · [CLI](#the-cli) · [Safety](#safety-model) · [Agent hosts](#agent-hosts)

</div>

---

## The one-paragraph version

CORAL connects to the **Robinhood Trading MCP** and **Robinhood Chain**, makes a trading decision, and then *keeps the
evidence*. Every decision calcifies into a **polyp** — one immutable row holding the observation that produced it, the
thesis, the confidence, and later the outcome. Before each new decision, CORAL **recalls** the polyps that resemble the
current setup, so a pattern that lost money twice loses its voice. The accumulated colony *is* the strategy. There is no
prompt to rewrite every morning, and nothing learned is thrown away when a process exits.

It runs in **paper mode by default**, needs **no API key to start**, and refuses to touch real money until you flip two
separate switches.

```
$ coral trade NVDA,AAPL --budget 200

  ▸ observe · reading 2 symbol(s) from robinhood-mcp
  ▸ recall  · pulling polyps that match today's setup
  ▸ reason  · thinking with claude-sonnet-4-5
  ▸ gate    · hard limits, non-negotiable
  ▸ settle  · settling decisions the market has now judged

    fill buy NVDA $100.00 @ $182.44
    polyps grown 2 · deployed $100.00 / $2500
```

---

## Why this exists

Every agent forgets. A session ends, the reasoning evaporates, and tomorrow the same agent re-derives the same thesis
with the same confidence. You pay for the same inference twice and call it a strategy.

The usual fix — a five-page system prompt — is not memory. It is instructions, and instructions don't know that NVDA
gapped on you twice in March.

CORAL is a response to that specific failure. The memory is a database, the recall is scored, the outcomes are recorded,
and the risk limits are code rather than prose. What accumulates is not context — it is evidence.

---

## How it works

A single pass is a LangGraph state graph. Six stages, one thread id, typed events throughout.

| Stage | What actually happens |
|---|---|
| **observe** | Quotes and daily bars from the Robinhood MCP when a token exists — otherwise real daily OHLCV from Yahoo (`source: "yahoo"`). A symbol that can't be fetched degrades to a deterministic synthetic series, clearly labelled `source: "synthetic"` all the way into the polyp. |
| **recall** | Polyps scored by `0.42·text + 0.15·semantic + 0.20·recency + 0.13·outcome + 0.06·sameSymbol + 0.04·tags`. `semantic` is cosine similarity over stored Gemini embeddings — polyps without one score exactly as before, so recall degrades to pure keyword matching when no embedding key exists. Losses weighted as loudly as wins. |
| **reason** | A model (one structured call per basket), or a deterministic heuristic when no key is set. Either way the output is Zod-validated and symbol-restricted. |
| **gate** | The risk manager. Deterministic, exhaustive, and unarguable. Every rejection carries a reason string. |
| **settle** | Polyps older than an hour get judged by realized price movement. A decision cannot be graded the instant it is made. |
| **calcify** | Every decision becomes a polyp — including refused ones, tagged `gated` with the reason frozen in `artifacts`. |

### A polyp

```jsonc
{
  "kind": "trade",
  "agent": "coral",
  "symbol": "NVDA",
  "action": "buy",
  "confidence": 0.68,
  "thesis": "BUY · rsi 31 · mom 4.3% · 24h 1.1% · 6 polyps recalled",
  "tags": ["mean-reversion", "oversold", "sanctioned"],
  "outcome": "pending",          // filled in by `settle`, never at write time
  "pnl": 0,
  "artifacts": {                 // frozen evidence, never re-derived
    "observation": { "price": 182.44, "rsi14": 31.2, "source": "robinhood-mcp" },
    "recalled": ["9f2a…", "41bc…"],
    "gate": { "allowed": true, "notional": 100 },
    "execution": { "status": "filled", "qty": 0.5482 }
  }
}
```

Polyps are append-only in spirit: a decision is never rewritten to look sharper in hindsight. Only `outcome` and `pnl`
are filled in later. That distinction is the whole reason the reef is worth something.

### Zones and generations

Tags group into **zones**. `coral evolve` computes a Laplace-smoothed win rate per zone — `(wins+1)/(decided+2)`, so
three lucky wins don't read as a 100% edge — and reweights:

- **≥ 0.60** → promoted, gains routing weight
- **< 0.42** → demoted, still routes but loses ties
- **5 losses, 0 wins** → retired

Every generation is written to the database with its promoted/demoted/retired lists, so the drift is auditable. Evolution
is deliberately **not** self-modifying: no prompt rewrites the prompt, no generated code is promoted to production. A
trading agent that can edit its own rules is a liability, not an achievement.

---

## Quick start

Requires **Node ≥ 22** and **pnpm 10**. No API key, no brokerage account, no card.

```bash
git clone https://github.com/CoralAgent/AgentCoral.git coral
cd coral
pnpm install
pnpm coral init
```

Spawn a reef and take it for a walk:

```bash
pnpm coral scan NVDA,AAPL,SPY            # observe + reason + gate — places nothing
pnpm coral trade NVDA --budget 200       # one full gated paper pass
pnpm coral reef "NVDA oversold" --why    # see what it remembered, and why it matched
pnpm coral status --skills               # reef health + live skill strength
pnpm coral evolve                        # advance a generation
```

Add a brain whenever you want — CORAL falls back to the heuristic if the call fails, so a dead key never stops the reef:

```bash
# .env
CORAL_LLM=anthropic            # or openai | google | xai
CORAL_MODEL=claude-sonnet-4-5
ANTHROPIC_API_KEY=sk-ant-...
```

Run the dashboard (reads the same SQLite file, no API):

```bash
pnpm web        # http://localhost:3000
```

The web app deploys on its own; see [DEPLOY.md](./DEPLOY.md) for Railway.

---

## The CLI

| Command | What it does |
|---|---|
| `coral init` | Spawn a reef, write `.env` |
| `coral connect [host\|--all]` | Register the MCP server in every detected agent host |
| `coral status [--skills] [--json]` | Polyps, generation, limits, connectivity |
| `coral scan [symbols]` | Observe, reason, gate — no orders. `--oak` reads on-chain tokens via Chainbridge |
| `coral trade [symbols] --budget 200` | One full gated pass. `--oak` observes tokens on Robinhood Chain |
| `coral evolve [--dry-run]` | Advance a generation |
| `coral history` | Ledger + generation log |
| `coral reef [query] [--why]` | Recall polyps, with scoring breakdown |
| `coral onchain status` | Chainbridge wallet: address, identity, setup, balances |
| `coral onchain quote <from> <to> <amount>` | Best-route DEX quote on Robinhood Chain |
| `coral onchain swap <from> <to> <amount>` | Gated token swap — paper by default, `-m live --confirm` signs |
| `coral onchain setup` | Checklist to unlock live on-chain actions |
| `coral api` | Local HTTP API on 127.0.0.1:7331 — the dApp backend |
| `coral backtest <symbol>` | Replay real bars through the real decide→gate→fill loop |
| `coral serve` | Run CORAL as an MCP server on stdio |
| `coral agents` | Which hosts are detected on this machine |

All commands accept `--json` where it makes sense. Global `--mode paper|live` overrides the environment.

---

## Agent hosts

CORAL speaks MCP in both directions.

**Direction 1 — CORAL calls Robinhood.** `coral connect --all` writes the hosted MCP entry into every agent config it
finds, backing up each original first. Each host has its own shape, handled in one table:

| Host | Config | Shape |
|---|---|---|
| Claude Code | `~/.claude.json` | `mcpServers → {type, url}` |
| Claude Desktop | `claude_desktop_config.json` | `mcpServers → {type, url}` |
| Codex | `~/.codex/config.json` | `mcpServers → {type, url}` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers → {type: "http", url}` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers → {httpUrl}` |
| Grok | `~/.grok/mcp.json` | `mcpServers → {type, url}` |

```bash
coral connect --all                 # every detected host
coral connect gemini --dry-run      # print what would be written, touch nothing
coral connect cursor --token $TOK   # pre-authorize with a bearer token
```

Or let each host do it natively:

```bash
claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
codex  mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading
gemini mcp add robinhood-trading https://agent.robinhood.com/mcp/trading -t http -s user
```

**Direction 2 — your agent calls CORAL.** `coral serve` exposes ten tools on stdio:

| Tool | Purpose |
|---|---|
| `coral_status` | Reef health: polyps, win rate, generation, zones |
| `coral_scan` | Decisions without orders |
| `coral_trade` | Full gated pass — **dry run unless `confirm: true`** |
| `coral_reef` | Recent polyps, or recall against a symbol |
| `coral_history` | Ledger |
| `coral_evolve` | Advance a generation |
| `coral_chain` | Robinhood Chain health (chainId 4663) |
| `coral_ask` | Natural language → routed skill, with diagnostics |
| `coral_onchain_quote` | DEX quote on Robinhood Chain via Chainbridge — read-only |
| `coral_onchain_swap` | Gated token swap — paper fill unless `confirm: true` in live mode |

```bash
claude mcp add coral -- pnpm --filter @coral/cli exec tsx src/index.ts serve
```

`coral_trade` and `coral_onchain_swap` are the only write tools, they default to a dry run, and they always run the
risk manager. An MCP client cannot place an unsanctioned order through this surface.

---

## On-chain execution via Chainbridge

CORAL trades equities through the hosted Robinhood Trading MCP. For Robinhood Chain it talks to the local
[Chainbridge](https://oakagentkit.org) MCP — a stdio bridge that reaches ~35 projects on chainId 4663: token discovery,
balances, prices, best-route DEX quotes, swaps, lending, bridges, and agent identity.

```bash
npm i -g @oakagentkit/addon    # once; `oak` must be on PATH (or set OAK_MCP_COMMAND)
pnpm coral onchain status      # wallet, identity, setup state
pnpm coral onchain quote USDG ETH 5
pnpm coral onchain swap USDG ETH 5         # paper fill through the same risk gate
pnpm coral scan CORAL --oak                 # observe the token, no order
```

Reads are free. A swap is priced in USD through a quote to USDG, reviewed by the same `RiskManager`, and only signs
in live mode after `confirm` — the gate fills the role Chainbridge gives the human "yes in chat". Live on-chain actions
additionally need the wallet funded with ETH for gas and an ERC-8004 identity; `coral onchain setup` prints the
checklist.

---

## The local API — `coral api`

The dApp (`/dapp` in the web app) talks to the reef through a small HTTP server that binds **127.0.0.1 only** —
custody and the risk gate stay in the CLI process, nothing is proxied to the public site.

```bash
pnpm coral api          # http://127.0.0.1:7331
```

| Route | What it returns |
|---|---|
| `GET /api/health` · `/api/status` | liveness, mode, reef snapshot, limits |
| `GET /api/reef` · `/api/reef/recall` · `/api/ledger` · `/api/positions` · `/api/generations` · `/api/zones` | memory, read-only |
| `GET /api/wallet` · `/api/quote` · `/api/token-series` | Chainbridge account/balances, live DEX quote, recorded token bars |
| `POST /api/scan` | full engine pass, `maxOrders: 0` — never trades |
| `POST /api/swap/preview` | resolve → quote → gate verdict; nothing written, nothing signed |
| `POST /api/swap` | the gated swap — paper fill, or live only with `confirm: true` |
| `POST /api/evolve` | advance a generation (`dryRun` supported) |

Browser requests must come from a loopback origin (`localhost`, `127.0.0.1`, `[::1]`) — anything else gets a 403,
so a random website cannot drive the agent through your browser. Set `CORAL_API_TOKEN` to additionally require a
bearer token (mandatory for `--host` beyond loopback — e.g. inside a container).

---

## Backtest — real bars, real loop

```bash
pnpm coral backtest AAPL --range 6mo     # Yahoo daily bars (real OHLCV, no key)
pnpm coral backtest CORAL --oak           # the recorded token-series, if deep enough
```

The replay feeds each bar through the same `observationFromBars → recall → heuristicDecide →
RiskManager.review → fill` pipeline the live engine uses, against a throwaway in-memory reef — it grows and
recalls its own polyps like a fresh colony and never touches the real one. Results include fees, buy-and-hold
comparison, max drawdown, and an honest refusal when there isn't enough real history (no synthetic bars are
substituted).

---

## Docker (local only)

```bash
docker compose up --build    # api → 127.0.0.1:7331 · web → 127.0.0.1:3000
```

`Dockerfile.web`, `Dockerfile.agent` and `docker-compose.yml` mirror the local stack; Railway still uses
Nixpacks, untouched. Constraints live in [DEPLOY.md](DEPLOY.md#6-docker-local-only) — notably: Chainbridge's keychain
does not cross into a container, and a non-loopback api bind requires `CORAL_API_TOKEN`.

---

## Safety model

The model is allowed to be optimistic. The gate is not.

Every limit lives in `packages/core/src/safety/risk-manager.ts` as a Zod-validated object, and runs *after* the model
has spoken and *before* anything touches a venue.

| Limit | Default | Enforced as |
|---|---|---|
| `maxOrderUsd` | `250` | Single-order ceiling; larger requests scaled down, not rejected |
| `maxDeployedUsd` | `2,500` | Total open cost basis; full book opens nothing |
| `maxPositionPct` | `0.25` | Per-symbol cap vs `maxDeployedUsd` — a fixed ceiling, not a moving ratio |
| `minConfidence` | `0.55` | Below this, a buy is refused regardless of thesis |
| `maxConsecutiveLosses` | `4` | Circuit breaker on settled losses |
| `maxDailyLossUsd` | `150` | Daily realized-loss cap |
| `symbolBlocklist` | `[]` | Never traded, whatever the setup |
| `allowLive` | `false` | Second live switch — see below |

**Going live takes three deliberate acts:**

1. `CORAL_MODE=live` in the environment
2. `limits.allowLive === true` — a source edit, on purpose
3. `coral trade … --yes` at the CLI

One of them alone places nothing.

Non-negotiables, enforced in code:

- Paper mode is the default in code, not in documentation.
- Fees are charged on every paper fill. Optimistic accounting is a lie with a compounding interest rate.
- A refused decision still becomes a polyp, tagged `gated`, with the reason frozen.
- A polyp cannot be settled in the same hour it was made.
- No prompt text is ever treated as a safety control.

**What CORAL cannot do, by construction:** move funds or touch non-Agentic accounts, trade short / on margin /
with leverage, or rewrite its own limits. Its own chain client stays read-only; on-chain execution happens only
through the explicit `coral onchain swap` path, which goes through Chainbridge's prepare→execute flow — exact approvals,
a simulated summary, a signature — after the risk gate allows it and only in live mode.

> CORAL is not investment advice and it is not a money machine. Automated trading can lose money faster than manual
> trading because it is faster. You are responsible for every order an agent places on your account, including the ones
> you did not watch.

---

## Architecture

```
coral/
├── packages/
│   ├── core/                  the reef's biology
│   │   ├── config.ts          env → typed config, every value defaulted
│   │   ├── memory/
│   │   │   ├── types.ts       polyp, zone, ledger, decision schemas (Zod)
│   │   │   ├── similarity.ts  token overlap, recency decay, outcome weight
│   │   │   └── coral-memory.ts SQLite: polyps, ledger, evolutions, zones
│   │   ├── safety/
│   │   │   └── risk-manager.ts hard limits — the only thing that says no
│   │   ├── skills/
│   │   │   └── router.ts      trigger scoring, zone-weighted
│   │   └── agent/
│   │       ├── engine.ts      LangGraph: observe→recall→reason→gate→settle→calcify
│   │       ├── brain.ts       provider selection, degrades to null
│   │       └── evolution.ts   zone reweighting, generation records
│   ├── skills/                what CORAL can actually do
│   │   ├── robinhood-mcp.ts   hosted MCP client; discovers tools, never hard-codes them
│   │   ├── robinhood-chain.ts JSON-RPC reads on the L2 (chainId 4663)
│   │   ├── oak-mcp.ts         stdio client to the local Chainbridge MCP (35 chain projects)
│   │   ├── oak-swap.ts        gated on-chain swap: resolve → quote → gate → fill
│   │   ├── oak-source.ts      token market data: live price + local series
│   │   ├── market-data.ts     real source, or a seeded synthetic tape
│   │   ├── indicators.ts      RSI, SMA, momentum, volatility — pure functions
│   │   └── *.skills.ts        router-visible capabilities
│   ├── mcp-connectors/        six host adapters + CORAL's own MCP server
│   └── cli/                   eleven commands, one runtime
├── apps/
│   └── web/                   Next.js 15 landing + docs + live reef dashboard
├── prompts/
│   └── system-prompt.md       the canonical reasoning prompt + tuning notes
└── turbo.json
```

**Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), pnpm workspace + Turborepo, official MCP SDK, Vercel AI SDK +
LangGraph, SQLite via `better-sqlite3`, Commander.js, Next.js 15 App Router + Tailwind v4, Zod, date-fns.

### Design decisions worth defending

**The dashboard does not import `@coral/core`.** It reads the same file with Node's built-in `node:sqlite` in read-only
mode. A native module dragged through a bundler resolves its binding relative to `.next/` and breaks at runtime — and a
marketing page should never be able to fail because a native binary is missing.

**The MCP client discovers tools, it does not assume them.** Robinhood ships new tools without notice. `RobinhoodMcp`
calls `listTools()` once, then resolves each capability (quote, bars, account, review, place) by scoring the live list.
A hard-coded tool name is a scheduled breakage.

**The heuristic is not a mock.** With no key, `scan` and `trade` run the full pipeline against a deterministic strategy —
mean reversion, trend continuation, reef bias, overbought penalty, scar penalty. Same gates, same polyps, same
settlement. It exists so the first run needs no signup, not so the demo looks nice.

**Settlement has a minimum age.** Without one, every polyp settles as a meaningless `0.00` "win" in the pass that created
it, and the win rate becomes fiction. An hour is arbitrary, honest, and enforced.

---

## Verification

```bash
pnpm typecheck                    # all five packages, strict
pnpm --filter @coral/core check   # 20 assertions, no framework
pnpm --filter @coral/web build    # Next.js production build
```

The check suite covers the logic that would quietly lie if it broke: similarity ranking, recency decay, risk gating
(confidence floor, hold exemption, scaling, circuit breaker, blocklist, live lock, fee accounting), router selection and
refusal, heuristic behaviour including the scar penalty, evolution thresholds, an end-to-end engine pass with settlement,
and the per-run order cap.

---

## Roadmap

- [ ] `sqlite-vec` recall for theses beyond token overlap
- [ ] Robinhood Chain settlement — a deliberate signing path, not a trading-loop side effect
- [ ] Cohort runs: several reefs with different limit sets, compared on a shared ledger
- [ ] `coral replay <polyp-id>` — re-run reasoning against a frozen artifact set
- [ ] Publishing `@coral/cli` so `npx` replaces the clone step

---

## Licence

MIT. See [LICENSE](./LICENSE).

Not affiliated with Robinhood Markets.

<div align="center">
<br />
<sub><em>Growing intelligence, one decision at a time.</em></sub>
</div>
