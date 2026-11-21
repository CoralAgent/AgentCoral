/**
 * The daemon — Phase 1 of the roadmap: the agent runs itself.
 *
 * A scheduler that runs the full engine pass on a cadence with no human
 * trigger: scan the watchlist, settle matured decisions, evolve zones, and
 * refresh the public snapshot so the site always shows the reef the agent
 * actually has.
 *
 * Two invariants, by design:
 * 1. The daemon is paper-only. It forces mode "paper" regardless of
 *    CORAL_MODE — live execution stays a manual, confirmed act
 *    (`coral onchain swap --confirm`), never a scheduled one.
 * 2. A failed pass never kills the daemon. LLM outages, RPC hiccups and
 *    empty quotes are logged and waited out; the reef keeps growing.
 */
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { evolve, selectWatchlist, type WatchlistSelection } from "@coral/core";
import { boot, type Runtime } from "./runtime.js";
import { publishSnapshot } from "./publish.js";
import { backfillEmbeddings, geminiEmbedder } from "./embeddings.js";

export interface DaemonConfig {
  /** minutes between passes */
  intervalMinutes: number;
  /** seed watchlist — the reef promotes from settled evidence (Phase 5) */
  symbols: string[];
  /** hard cap on names the reef may watch per pass */
  maxWatch: number;
  /** Phase 5: the reef re-derives its watchlist from its own zone edges */
  selfSelect: boolean;
  /** "equity" (Robinhood data) or "oak" (on-chain quotes via Chainbridge) */
  venue: "equity" | "oak";
  /** place gated PAPER orders on each pass (scan-only when false) */
  trade: boolean;
  /** USD the paper pass may deploy per run */
  budget: number;
  /** hard cap on orders per run */
  maxOrders: number;
  /** evolve a generation every N passes */
  evolveEvery: number;
  /** refresh apps/web/reef-snapshot after each pass */
  publish: boolean;
  /** also commit + push the snapshot (redeploys the site) */
  publishGit: boolean;
}

const DEFAULT_CONFIG: DaemonConfig = {
  intervalMinutes: 60,
  symbols: ["AAPL", "MSFT", "NVDA"],
  maxWatch: 6,
  selfSelect: true,
  venue: "equity",
  trade: false,
  budget: 250,
  maxOrders: 1,
  evolveEvery: 6,
  publish: true,
  publishGit: false,
};

export interface DaemonStatus {
  startedAt: string;
  lastPassAt: string | null;
  nextPassAt: string | null;
  passCount: number;
  generation: number;
  polyps: number;
  mode: "paper";
  lastError: string | null;
  lastPass: {
    runId: string;
    watchlist: string[];
    watchlistBasis: "seed" | "reef";
    decisions: { symbol: string; action: string; confidence: number }[];
    filled: number;
    rejected: number;
  } | null;
}

/** Config lives beside the reef, so the daemon and the reef move together. */
export function loadDaemonConfig(home: string): { config: DaemonConfig; path: string; created: boolean } {
  const path = join(home, "daemon.json");
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { config: DEFAULT_CONFIG, path, created: true };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<DaemonConfig>;
  return {
    config: {
      ...DEFAULT_CONFIG,
      ...parsed,
      symbols: parsed.symbols ?? DEFAULT_CONFIG.symbols,
    },
    path,
    created: false,
  };
}

function writeStatus(rt: Runtime, status: DaemonStatus): void {
  const snap = rt.memory.snapshot();
  status.generation = snap.generation;
  status.polyps = snap.polyps;
  writeFileSync(join(rt.config.home, "daemon-status.json"), JSON.stringify(status, null, 2));
}

/** Minimal loopback status endpoint — GET / is the whole surface. */
function startStatusServer(status: DaemonStatus, port: number): Server {
  const server = createServer((req, res) => {
    if ((req.method ?? "GET") !== "GET" || !["/", "/status", "/healthz"].includes(req.url ?? "/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, ...status }));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

export interface DaemonOpts {
  once?: boolean;
  statusPort?: number;
  quiet?: boolean;
}

export async function runDaemon(opts: DaemonOpts = {}): Promise<void> {
  // Invariant 1: the daemon is paper-only, whatever the env says.
  const rt = boot({ mode: "paper" });
  const { config, path: configPath, created } = loadDaemonConfig(rt.config.home);
  const log = (line: string) => {
    if (!opts.quiet) console.log(line);
  };

  const status: DaemonStatus = {
    startedAt: new Date().toISOString(),
    lastPassAt: null,
    nextPassAt: null,
    passCount: 0,
    generation: rt.memory.snapshot().generation,
    polyps: rt.memory.snapshot().polyps,
    mode: "paper",
    lastError: null,
    lastPass: null,
  };

  const statusServer = opts.statusPort
    ? startStatusServer(status, opts.statusPort)
    : undefined;
  if (statusServer) log(`  status → http://127.0.0.1:${opts.statusPort}/`);

  const runPass = async (): Promise<void> => {
    const source = config.venue === "oak" ? rt.tokenSource : rt.source;
    // Phase 5: the reef picks what it watches from its own settled zone edges.
    const selection: WatchlistSelection = config.selfSelect
      ? selectWatchlist(rt.memory, { seed: config.symbols, max: config.maxWatch })
      : { symbols: config.symbols, basis: "seed", reasons: {} };
    if (config.selfSelect) log(`  watchlist (${selection.basis}) → ${selection.symbols.join(", ")}`);

    const report = config.trade
      ? await rt.engine.run({
          symbols: selection.symbols,
          source,
          budgetUsd: config.budget,
          maxOrders: config.maxOrders,
        })
      : await rt.engine.scan(selection.symbols, source);

    const embedded = await backfillEmbeddings(rt.memory, geminiEmbedder);
    if (embedded > 0) log(`  embedded ${embedded} theses — semantic recall deepened`);

    status.passCount += 1;
    status.lastPassAt = new Date().toISOString();
    status.lastPass = {
      runId: report.runId,
      watchlist: selection.symbols,
      watchlistBasis: selection.basis,
      decisions: report.decisions.map((d) => ({
        symbol: d.symbol,
        action: d.action,
        confidence: d.confidence,
      })),
      filled: report.executions.filter((e) => e.status === "filled").length,
      rejected: report.executions.filter((e) => e.status === "rejected").length,
    };

    log(
      `  pass ${status.passCount} · ${status.lastPass.decisions.length} decisions · ` +
        `${status.lastPass.filled} filled · ${status.lastPass.rejected} rejected · reasoner ${report.reasoner}`,
    );

    // Evolve on cadence — zones earn their weight from settled evidence.
    if (config.evolveEvery > 0 && status.passCount % config.evolveEvery === 0) {
      const result = evolve(rt.memory, { minSamples: 3 });
      rt.router.syncZones(rt.memory.zones());
      log(
        `  evolve → generation ${result.generation} · promoted ${result.promoted.length} · demoted ${result.demoted.length}`,
      );
    }

    if (config.publish) {
      const pub = publishSnapshot(rt, { git: config.publishGit, quiet: true });
      log(`  snapshot → ${pub.polyps} polyps · generation ${pub.generation}${pub.pushed ? " · pushed" : ""}`);
    }
  };

  if (created) log(`  config written → ${configPath} (symbols are now a seed — the reef picks the rest from its own edges)`);

  // A failed pass is weather, not a reason to die. Invariant 2.
  const attemptPass = async (): Promise<void> => {
    try {
      await runPass();
      status.lastError = null;
    } catch (e) {
      status.lastError = e instanceof Error ? e.message : String(e);
      log(`  pass failed — ${status.lastError}`);
    }
    writeStatus(rt, status);
  };

  const shutdown = (): void => {
    status.nextPassAt = null;
    writeStatus(rt, status);
    if (statusServer) statusServer.close();
    rt.close();
    log(`  daemon stopped after ${status.passCount} pass(es)`);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await attemptPass();
  if (opts.once) {
    if (statusServer) statusServer.close();
    rt.close();
    return;
  }

  const intervalMs = Math.max(1, config.intervalMinutes) * 60_000;
  const tick = (): void => {
    status.nextPassAt = new Date(Date.now() + intervalMs).toISOString();
    writeStatus(rt, status);
    setTimeout(async () => {
      await attemptPass();
      tick();
    }, intervalMs);
  };
  tick();
}
