/**
 * coral backtest — replay real historical bars through the real decision loop.
 *
 * The replay uses the same primitives the live engine uses:
 * observationFromBars → recall → heuristicDecide → RiskManager.review →
 * RiskManager.fill — against a throwaway in-memory reef, so a backtest grows
 * and recalls its own polyps exactly like a fresh colony would, and never
 * touches the real reef.
 *
 * Data provenance is honest:
 *   equity — Yahoo Finance daily bars (real OHLCV, no key)
 *   token  — token-series.json: bars CORAL itself sampled from live Chainbridge quotes
 * If a symbol has no real history, the command refuses and says why — it does
 * not fall back to invented bars.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CoralMemory,
  RiskManager,
  heuristicDecide,
  type LedgerEntry,
} from "@coral/core";
import { observationFromBars, type Bar } from "@coral/skills";

const WARMUP = 30;

export interface BacktestOptions {
  symbol: string;
  bars: Bar[];
  source: "robinhood-mcp" | "chainbridge";
  /** USD the replay starts with. */
  budget: number;
  warmup?: number;
}

export interface BacktestResult {
  symbol: string;
  source: string;
  bars: number;
  from: string;
  to: string;
  startEquity: number;
  endEquity: number;
  returnPct: number;
  buyHoldPct: number;
  vsBuyHold: number;
  trades: number;
  wins: number;
  losses: number;
  feesPaid: number;
  maxDrawdownPct: number;
  openPosition: { qty: number; markUsd: number } | null;
  notes: string[];
}

/** Daily closes from Yahoo's public chart endpoint — real OHLCV, no key. */
export async function fetchYahooDaily(symbol: string, range: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (coral backtest; real OHLCV)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`yahoo returned HTTP ${res.status} for ${symbol}`);
  const json = (await res.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
      error?: { description?: string };
    };
  };
  if (json.chart?.error) throw new Error(`yahoo: ${json.chart.error.description ?? "unknown error"}`);
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    const t = ts[i];
    if (typeof close === "number" && Number.isFinite(close) && close > 0 && typeof t === "number") {
      bars.push({ t: new Date(t * 1000).toISOString(), close });
    }
  }
  return bars;
}

/** Bars the OakTokenSource recorded from live quotes — the only real on-chain history CORAL has. */
export function readRecordedSeries(home: string, symbol: string): Bar[] {
  const file = join(home, "token-series.json");
  if (!existsSync(file)) return [];
  try {
    const all = JSON.parse(readFileSync(file, "utf8")) as Record<string, Bar[]>;
    return all[symbol.toUpperCase()] ?? [];
  } catch {
    return [];
  }
}

export function backtest(o: BacktestOptions): BacktestResult {
  const warmup = o.warmup ?? WARMUP;
  if (o.bars.length < warmup + 1) {
    throw new Error(
      `only ${o.bars.length} real bar(s) for ${o.symbol} — need at least ${warmup + 1} ` +
        `for RSI/SMA/momentum to mean anything. No fabricated history is substituted.`,
    );
  }

  const symbol = o.symbol.toUpperCase();
  // A throwaway reef: the backtest recalls only what it grew itself.
  const memory = new CoralMemory(":memory:");
  const risk = new RiskManager(RiskManager.forMode("paper"));
  const notes: string[] = [];

  let cash = o.budget;
  let qty = 0;
  let entryPrice = 0;
  let feesPaid = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let peak = o.budget;
  let maxDrawdownPct = 0;

  const equityAt = (price: number) => cash + qty * price;
  const riskState = (price: number) => {
    const positions = memory.openPositions();
    const pos = positions.find((p) => p.symbol === symbol);
    const today = o.bars[0]!.t.slice(0, 10); // the replay's "today" is the data's day
    const daily = memory.db
      .prepare<[string], { pnl: number }>(
        "SELECT COALESCE(SUM(pnl),0) AS pnl FROM polyps WHERE outcome != 'pending' AND substr(created_at,1,10) = ?",
      )
      .get(today);
    const recent = memory.db
      .prepare<[], { outcome: string }>(
        "SELECT outcome FROM polyps WHERE outcome IN ('win','loss') AND kind IN ('decision','trade') ORDER BY created_at DESC LIMIT 10",
      )
      .all();
    let streak = 0;
    for (const r of recent) {
      if (r.outcome === "loss") streak++;
      else break;
    }
    return {
      mode: "paper" as const,
      deployedUsd: memory.deployedCapital(),
      symbolExposureUsd: Math.max(0, pos?.cost ?? 0),
      consecutiveLosses: streak,
      dailyPnl: daily?.pnl ?? 0,
    };
  };

  const record = (side: "buy" | "sell", fillQty: number, price: number, notional: number): void => {
    const entry: LedgerEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      mode: "paper",
      symbol,
      side,
      qty: fillQty,
      price,
      notional,
      polypId: null,
      status: "filled",
      venue: "paper",
    };
    memory.record(entry);
  };

  for (let i = warmup; i < o.bars.length; i++) {
    const window = o.bars.slice(0, i + 1);
    const price = window[window.length - 1]!.close;
    const obs = observationFromBars(symbol, window, "backtest", new Date(window[window.length - 1]!.t));

    const hits = memory.recall({
      query: `${symbol} rsi ${obs.rsi14.toFixed(0)} momentum ${(obs.momentum20 * 100).toFixed(1)}`,
      symbol,
      tags: ["momentum", "mean-reversion"],
      limit: 6,
    });
    const stats = memory.stats();
    const decision = heuristicDecide(obs, {
      bias: stats.bias.get(symbol) ?? 0,
      hits,
      holding: qty > 0,
    });

    const equity = equityAt(price);
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? (peak - equity) / peak : 0);

    if (decision.action === "buy" && cash > 0) {
      const requested = Math.min(risk.limits.maxOrderUsd, cash);
      const verdict = risk.review(
        { decision, price, requestedNotional: requested },
        { ...riskState(price), mode: "paper" },
      );
      if (verdict.allowed && verdict.notional > 0) {
        const fill = risk.fill(Math.min(verdict.notional, cash), price);
        qty += fill.qty;
        entryPrice = fill.netNotional / fill.qty;
        cash -= fill.netNotional + fill.fees;
        feesPaid += fill.fees;
        trades++;
        record("buy", fill.qty, price, fill.netNotional + fill.fees);
        memory.grow({
          kind: "trade",
          agent: "coral",
          symbol,
          thesis: decision.thesis,
          action: "buy",
          confidence: decision.confidence,
          outcome: "pending",
          pnl: 0,
          tags: [...decision.tags, "backtest"],
          artifacts: { bar: window[window.length - 1]!.t, price, fees: fill.fees },
        });
      }
    } else if (decision.action === "sell" && qty > 0) {
      const positionUsd = qty * price;
      const verdict = risk.review(
        { decision, price, requestedNotional: positionUsd },
        { ...riskState(price), mode: "paper" },
      );
      if (verdict.allowed) {
        const sellQty = Math.min(qty, verdict.notional > 0 ? verdict.notional / price : qty);
        const exitNotional = sellQty * price;
        const exitFee = exitNotional * risk.limits.feeRate;
        const pnl = risk.pnl(sellQty, entryPrice, price);
        qty -= sellQty;
        cash += exitNotional - exitFee;
        feesPaid += exitFee;
        trades++;
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
        record("sell", sellQty, price, exitNotional);
        memory.grow({
          kind: "trade",
          agent: "coral",
          symbol,
          thesis: decision.thesis,
          action: "sell",
          confidence: decision.confidence,
          outcome: pnl > 0 ? "win" : pnl < 0 ? "loss" : "neutral",
          pnl,
          tags: [...decision.tags, "backtest"],
          artifacts: { bar: window[window.length - 1]!.t, price, entryPrice, pnl, exitFee },
        });
        if (qty < 1e-9) {
          qty = 0;
          entryPrice = 0;
        }
      }
    }
  }

  const lastBar = o.bars[o.bars.length - 1]!;
  const last = lastBar.close;
  const firstBar = o.bars[0]!;
  const endEquity = equityAt(last);
  const buyHoldEnd = (o.budget / firstBar.close) * last;
  memory.close();

  if (qty > 0) {
    notes.push(`position still open at end — ${qty.toFixed(6)} ${symbol} marked at the last close`);
  }
  notes.push(`heuristic reasoner (the same one the engine uses without a model key)`);
  notes.push(`fee model: ${(risk.limits.feeRate * 100).toFixed(2)}% per side, same as paper fills`);

  return {
    symbol,
    source: o.source,
    bars: o.bars.length,
    from: firstBar.t.slice(0, 10),
    to: lastBar.t.slice(0, 10),
    startEquity: o.budget,
    endEquity,
    returnPct: (endEquity / o.budget - 1) * 100,
    buyHoldPct: (buyHoldEnd / o.budget - 1) * 100,
    vsBuyHold: (endEquity - buyHoldEnd) / o.budget * 100,
    trades,
    wins,
    losses,
    feesPaid,
    maxDrawdownPct: maxDrawdownPct * 100,
    openPosition: qty > 0 ? { qty, markUsd: qty * last } : null,
    notes,
  };
}
