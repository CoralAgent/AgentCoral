/**
 * Checks for broker-priced bars. No test framework — `assert` and a tiny
 * runner, same shape as @coral/core's smoke.ts.
 * Run with `pnpm --filter @coral/skills check`.
 *
 * Covers the logic that would quietly lie if it broke: bar merging must never
 * drop a cached bar, must prefer the broker's revision of a re-served bar,
 * and normalisation must accept every bar shape seen in the wild.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { brokerSeriesPath, mergeBars, readBrokerSeries, writeBrokerSeries } from "../broker-series.js";
import { normaliseBars } from "../robinhood-mcp.js";
import type { Bar } from "../indicators.js";

const results: { name: string; ok: boolean; error?: string }[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: (e as Error).message });
  }
}

const bar = (t: string, close: number): Bar => ({ t, close });

test("mergeBars dedupes by timestamp and sorts ascending", () => {
  const merged = mergeBars([bar("2026-01-03T00:00:00Z", 3)], [bar("2026-01-01T00:00:00Z", 1), bar("2026-01-03T00:00:00Z", 3.5)]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((b) => b.t), ["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"]);
});

test("mergeBars keeps the broker's revision of a re-served bar", () => {
  const merged = mergeBars([bar("2026-01-01T00:00:00Z", 10)], [bar("2026-01-01T00:00:00Z", 10.5)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.close, 10.5);
});

test("mergeBars never drops existing cached bars the broker no longer returns", () => {
  const existing = [bar("2026-01-01T00:00:00Z", 1), bar("2026-01-02T00:00:00Z", 2), bar("2026-01-03T00:00:00Z", 3)];
  const merged = mergeBars(existing, [bar("2026-01-04T00:00:00Z", 4)]);
  assert.equal(merged.length, 4);
});

test("broker series round-trips through disk", () => {
  const home = mkdtempSync(join(tmpdir(), "coral-broker-"));
  try {
    writeBrokerSeries(home, "AAPL", [bar("2026-01-01T00:00:00Z", 1)]);
    assert.deepEqual(readBrokerSeries(home, "AAPL"), [bar("2026-01-01T00:00:00Z", 1)]);
    assert.equal(readBrokerSeries(home, "MSFT").length, 0);
    assert.equal(readBrokerSeries(join(home, "nope"), "AAPL").length, 0);
    const raw = JSON.parse(readFileSync(brokerSeriesPath(home), "utf8")) as Record<string, Bar[]>;
    assert.ok(raw.AAPL);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("writeBrokerSeries tolerates a corrupt cache file and rebuilds it", () => {
  const home = mkdtempSync(join(tmpdir(), "coral-broker-"));
  try {
    writeFileSync(brokerSeriesPath(home), "{ not json");
    writeBrokerSeries(home, "AAPL", [bar("2026-01-01T00:00:00Z", 1)]);
    assert.deepEqual(readBrokerSeries(home, "AAPL"), [bar("2026-01-01T00:00:00Z", 1)]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("normaliseBars accepts the shapes seen in the wild", () => {
  const day = { begin_at: "2026-01-01T00:00:00Z", close_price: "42.5", volume: 100 };
  const iso = [{ data: [day] }];
  const bars = normaliseBars(iso);
  assert.equal(bars.length, 1);
  assert.equal(bars[0]!.close, 42.5);
  assert.equal(normaliseBars({ bars: [{ t: "2026-01-01T00:00:00Z", c: 7 }] })[0]!.close, 7);
  assert.equal(normaliseBars({ results: [{ bars: [{ close: 3, timestamp: 1767225600 }] }] })[0]!.close, 3);
  assert.equal(normaliseBars([{ close: 9, volume: 0 }]).length, 1);
  assert.equal(normaliseBars("not an object").length, 0);
  assert.equal(normaliseBars([{ close: -5 }]).length, 0);
});

let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`✓ ${r.name}`);
  else {
    failed++;
    console.error(`✗ ${r.name}\n  ${r.error}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0) process.exit(1);
