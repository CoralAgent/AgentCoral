/**
 * Broker-priced bar cache — the reef's own record of what the broker showed.
 *
 * Every time the Robinhood MCP serves historicals, they are merged into
 * broker-series.json next to the reef. Over time this becomes the only price
 * history CORAL can backtest against without borrowing someone else's bars:
 * broker-priced, timestamped, and auditable in a plain JSON file.
 *
 * The file mirrors token-series.json's shape ({ SYMBOL: Bar[] }) so the web
 * snapshot and the evidence pipeline can treat both identically.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bar } from "./indicators.js";

export interface BrokerSeriesOptions {
  home: string;
}

export function brokerSeriesPath(home: string): string {
  return join(home, "broker-series.json");
}

export function readBrokerSeries(home: string, symbol: string): Bar[] {
  const file = brokerSeriesPath(home);
  if (!existsSync(file)) return [];
  try {
    const all = JSON.parse(readFileSync(file, "utf8")) as Record<string, Bar[]>;
    return all[symbol.toUpperCase()] ?? [];
  } catch {
    return [];
  }
}

/**
 * Merge incoming bars into the cached series: dedupe by timestamp, keep the
 * newest observation of each bar (a broker may revise the latest bar), sort
 * ascending. Existing bars are never silently dropped.
 */
export function mergeBars(existing: Bar[], incoming: Bar[]): Bar[] {
  const byTime = new Map<string, Bar>();
  for (const bar of existing) byTime.set(bar.t, bar);
  for (const bar of incoming) byTime.set(bar.t, bar);
  return [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
}

export function writeBrokerSeries(home: string, symbol: string, bars: Bar[]): void {
  const file = brokerSeriesPath(home);
  let all: Record<string, Bar[]> = {};
  if (existsSync(file)) {
    try {
      all = JSON.parse(readFileSync(file, "utf8")) as Record<string, Bar[]>;
    } catch {
      all = {};
    }
  }
  all[symbol.toUpperCase()] = bars;
  writeFileSync(file, JSON.stringify(all, null, 2));
}
