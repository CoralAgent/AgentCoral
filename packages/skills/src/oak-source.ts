/**
 * OakTokenSource — market data for Robinhood Chain tokens.
 *
 * OAK has no candle endpoint, so this source keeps its own series: every
 * observe() samples the live USD price (the `price` tool when the pool is
 * fresh, a 1-USDG quote-implied price when it is not) and appends a bar to a
 * JSON series under CORAL_HOME. RSI, SMA, momentum and volatility are real
 * once the series has depth — before that they degrade to neutral values
 * rather than invented ones.
 *
 * Warm-up is honest: a token whose series is one bar old produces a hold-
 * grade observation, not a fabricated trend.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketDataSource, Observation } from "@coral/core";
import { observationFromBars, type Bar } from "./indicators.js";
import type { OakMcp } from "./oak-mcp.js";

interface Series {
  /** symbol → bars, oldest first, capped. */
  [symbol: string]: Bar[];
}

const MAX_BARS = 500;
/** Don't append more than one bar per interval — the file is a series, not a log. */
const SAMPLE_MS = 60 * 1000;

export interface OakTokenSourceOptions {
  oak: () => OakMcp;
  /** Directory for the series file (config.home). */
  home: string;
}

export class OakTokenSource implements MarketDataSource {
  readonly name = "chainbridge";
  private readonly path: string;
  private series: Series;

  constructor(private readonly deps: OakTokenSourceOptions) {
    this.path = join(deps.home, "token-series.json");
    this.series = this.load();
  }

  private load(): Series {
    try {
      if (!existsSync(this.path)) return {};
      return JSON.parse(readFileSync(this.path, "utf8")) as Series;
    } catch {
      return {};
    }
  }

  private save(): void {
    mkdirSync(this.deps.home, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.series), "utf8");
  }

  private append(symbol: string, price: number, now: Date): Bar[] {
    const bars = this.series[symbol] ?? [];
    const last = bars[bars.length - 1];
    if (!last || now.getTime() - new Date(last.t).getTime() >= SAMPLE_MS) {
      bars.push({ t: now.toISOString(), close: price });
      if (bars.length > MAX_BARS) bars.splice(0, bars.length - MAX_BARS);
      this.series[symbol] = bars;
      this.save();
    }
    return bars;
  }

  private async livePrice(query: string): Promise<number | null> {
    const oak = this.deps.oak();
    await oak.connect();
    const direct = await oak.usdPrice(query);
    if (direct !== null) return direct;
    return oak.usdValue(query, "1");
  }

  async observe(symbols: string[]): Promise<Observation[]> {
    const oak = this.deps.oak();
    await oak.connect();
    const now = new Date();
    const out: Observation[] = [];
    for (const raw of symbols) {
      const info = await oak.resolveToken(raw).catch(() => null);
      if (!info) continue;
      const price = await this.livePrice(info.address);
      if (price === null || !Number.isFinite(price) || price <= 0) continue;
      const bars = this.append(info.symbol, price, now);
      out.push(observationFromBars(info.symbol, bars, "chainbridge", now));
    }
    return out;
  }

  async quote(symbol: string): Promise<number | null> {
    const oak = this.deps.oak();
    await oak.connect();
    const info = await oak.resolveToken(symbol).catch(() => null);
    return info ? this.livePrice(info.address) : null;
  }
}
