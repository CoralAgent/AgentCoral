/**
 * Market data: where observations come from.
 *
 * Priority is honest: the hosted Robinhood MCP if a token exists, otherwise a
 * clearly-labelled synthetic series so the reef can be exercised offline.
 * Synthetic observations carry `source: "synthetic"` all the way into the polyp
 * artifacts — a decision made on synthetic data is never mistaken for real.
 */
import type { MarketDataSource, Observation } from "@coral/core";
import { observationFromBars, type Bar } from "./indicators.js";
import { quotePrice, RobinhoodMcp } from "./robinhood-mcp.js";

export interface SourceOptions {
  mcpUrl: string;
  mcpToken: string | null;
}

/** Hosted Robinhood MCP. Errors are surfaced, never silently replaced. */
export class RobinhoodMcpSource implements MarketDataSource {
  readonly name = "robinhood-mcp";
  private readonly client: RobinhoodMcp;

  constructor(opts: SourceOptions) {
    this.client = new RobinhoodMcp({ url: opts.mcpUrl, token: opts.mcpToken });
  }

  get mcp(): RobinhoodMcp {
    return this.client;
  }

  async observe(symbols: string[]): Promise<Observation[]> {
    await this.client.connect();
    const out: Observation[] = [];
    for (const symbol of symbols) {
      const bars = await this.client.bars(symbol);
      if (bars.length === 0) throw new Error(`Robinhood MCP returned no bars for ${symbol}`);
      out.push(observationFromBars(symbol, bars, "robinhood-mcp"));
    }
    return out;
  }

  async quote(symbol: string): Promise<number | null> {
    await this.client.connect();
    const raw = await this.client.quotes([symbol]);
    return quotePrice(raw, symbol);
  }
}

/**
 * Deterministic synthetic series: seeded per symbol, so the same symbol on the
 * same day produces the same tape. A random walk would make runs unrepeatable
 * and hide regressions.
 */
export class SyntheticSource implements MarketDataSource {
  readonly name = "synthetic";

  constructor(private readonly days = 120) {}

  private seedFor(symbol: string): number {
    let h = 2166136261;
    for (const ch of symbol.toUpperCase()) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Mulberry32 — tiny, deterministic, no dependency. */
  private rng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private bars(symbol: string): Bar[] {
    const rand = this.rng(this.seedFor(symbol));
    // Base price derived from the symbol so different tickers look different.
    let price = 20 + (this.seedFor(symbol) % 480);
    const drift = ((this.seedFor(symbol) % 200) - 100) / 20_000; // -0.5%..+0.5% per bar
    const vol = 0.012 + (this.seedFor(symbol) % 20) / 1_000;
    const bars: Bar[] = [];
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - this.days);

    for (let i = 0; i < this.days; i++) {
      const shock = (rand() - 0.5) * 2 * vol;
      price = Math.max(1, price * (1 + drift + shock));
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      bars.push({ t: d.toISOString(), close: Number(price.toFixed(4)), volume: Math.round(1e6 * (0.5 + rand())) });
    }
    return bars;
  }

  async observe(symbols: string[]): Promise<Observation[]> {
    return symbols.map((s) => observationFromBars(s, this.bars(s), "synthetic"));
  }

  async quote(symbol: string): Promise<number | null> {
    const bars = this.bars(symbol);
    return bars[bars.length - 1]?.close ?? null;
  }
}

/**
 * Daily closes from Yahoo's public chart endpoint — real OHLCV, no key.
 * Delayed daily bars, not live quotes; honest labelling matters more than
 * freshness here, so observations carry `source: "yahoo"`.
 */
export async function yahooDaily(symbol: string, range: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (coral; real OHLCV)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`yahoo returned HTTP ${res.status} for ${symbol}`);
  const json = (await res.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
      }[];
      error?: { description?: string };
    };
  };
  if (json.chart?.error) throw new Error(`yahoo: ${json.chart.error.description ?? "unknown error"}`);
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    const t = ts[i];
    if (typeof close === "number" && Number.isFinite(close) && close > 0 && typeof t === "number") {
      const volume = volumes[i];
      bars.push({
        t: new Date(t * 1000).toISOString(),
        close,
        volume: typeof volume === "number" && Number.isFinite(volume) ? volume : undefined,
      });
    }
  }
  return bars;
}

/**
 * Real equity data without a broker token: Yahoo daily bars per symbol.
 * A symbol that fails to fetch falls back to a clearly-labelled synthetic
 * observation for that symbol only — the reef degrades, never fabricates.
 */
export class YahooSource implements MarketDataSource {
  readonly name = "yahoo";
  private readonly fallback = new SyntheticSource();

  constructor(private readonly range = "6mo") {}

  async observe(symbols: string[]): Promise<Observation[]> {
    const out: Observation[] = [];
    for (const symbol of symbols) {
      try {
        const bars = await yahooDaily(symbol, this.range);
        if (bars.length < 30) throw new Error(`only ${bars.length} bars`);
        out.push(observationFromBars(symbol, bars, "yahoo"));
      } catch (e) {
        // Degrade loudly: the reef continues on synthetic for this symbol, but
        // the operator must know the feed is down.
        console.warn(`[yahoo] ${symbol}: ${e instanceof Error ? e.message : e} — degrading to labelled synthetic`);
        const degraded = await this.fallback.observe([symbol]);
        out.push(...degraded);
      }
    }
    return out;
  }

  async quote(symbol: string): Promise<number | null> {
    try {
      const bars = await yahooDaily(symbol, "5d");
      return bars[bars.length - 1]?.close ?? null;
    } catch (e) {
      console.warn(`[yahoo] quote ${symbol}: ${e instanceof Error ? e.message : e} — degrading to synthetic`);
      return this.fallback.quote(symbol);
    }
  }
}

/** Pick the best source the environment can honestly support. */
export function createSource(opts: SourceOptions): MarketDataSource {
  return opts.mcpToken ? new RobinhoodMcpSource(opts) : new YahooSource();
}
