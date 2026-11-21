/**
 * Phase 5: the reef chooses what it watches.
 *
 * The watchlist used to live in daemon.json — a human's guess, frozen at
 * boot. Now every pass re-derives it from the reef's own settled evidence:
 * symbols whose polyps live in mature, above-neutral zones earn attention,
 * unsettled polyps hold their symbol until the market grades it, and the
 * old config list survives only as a seed — names the reef may promote once
 * they earn it, never names it must watch forever.
 *
 * Same honesty rules as everywhere else in the reef: neutral holds settle
 * nothing here, a young reef refuses to choose and keeps its seed, and a
 * zone needs three decided polyps before its edge may direct attention —
 * the same bar the evidence page uses.
 */
import type { CoralMemory } from "../memory/coral-memory.js";

export interface WatchlistSelection {
  symbols: string[];
  /** "seed" while the reef is too young to choose; "reef" once evidence leads. */
  basis: "seed" | "reef";
  /** Why each symbol is watched — one line per symbol, for the daemon log. */
  reasons: Record<string, string>;
}

export interface WatchlistOptions {
  /** Fallback names plus the exploration floor. */
  seed: string[];
  /** Hard cap on watchlist size. Unsettled polyps ignore the cap — they must settle. */
  max?: number;
  /** Settled polyps required before the reef trusts its own edges. */
  minDecided?: number;
}

/** A zone must clear the same three-decided bar the evidence page uses. */
const MATURE_ZONE_DECIDED = 3;

export function selectWatchlist(memory: CoralMemory, opts: WatchlistOptions): WatchlistSelection {
  const seed = [...new Set(opts.seed.filter(Boolean))];
  const max = Math.max(1, opts.max ?? 5);
  const minDecided = opts.minDecided ?? 5;

  const reasons: Record<string, string> = {};
  const symbols: string[] = [];
  const take = (symbol: string, reason: string): void => {
    if (symbols.includes(symbol)) return;
    symbols.push(symbol);
    reasons[symbol] = reason;
  };

  const pending = new Map<string, number>();
  const settled = new Map<string, { tags: string[]; pnl: number }[]>();
  let decided = 0;

  for (const row of memory.watchCandidates()) {
    if (row.outcome === "pending") {
      pending.set(row.symbol, (pending.get(row.symbol) ?? 0) + 1);
    } else if (row.outcome === "win" || row.outcome === "loss") {
      decided++;
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags) as string[];
      } catch {
        // a tagless polyp scores neutral — never a reason to crash a pass
      }
      const list = settled.get(row.symbol) ?? [];
      list.push({ tags, pnl: row.pnl });
      settled.set(row.symbol, list);
    }
    // neutral holds settle out of selection too — a hold is not a free vote
  }

  // Unsettled polyps hold their symbol until the market grades it.
  for (const [symbol, n] of pending) take(symbol, `${n} unsettled polyp${n === 1 ? "" : "s"} awaiting settlement`);

  // A young reef refuses to choose — its seed comes back untouched.
  if (decided < minDecided) {
    for (const s of seed) take(s, "seed — the reef is too young to choose");
    return { symbols, basis: "seed", reasons };
  }

  // Mature zones only, pooled across symbols — same bar as the evidence page.
  const strength = new Map(
    memory
      .zones()
      .filter((z) => z.wins + z.losses >= MATURE_ZONE_DECIDED)
      .map((z) => [z.name, z.strength] as const),
  );

  const ranked = [...settled.entries()]
    .map(([symbol, polyps]) => {
      let edge = 0;
      let pnl = 0;
      for (const p of polyps) {
        pnl += p.pnl;
        for (const tag of p.tags) {
          const s = strength.get(tag);
          if (s !== undefined && s > edge) edge = s;
        }
      }
      return { symbol, edge, pnl, polyps: polyps.length };
    })
    .filter((r) => r.edge > 0.5) // a below-neutral zone never directs attention
    .sort((a, b) => b.edge - a.edge || b.pnl - a.pnl || a.symbol.localeCompare(b.symbol));

  const slots = Math.max(0, max - symbols.length);
  for (const r of ranked.slice(0, slots)) {
    take(r.symbol, `zone edge ${r.edge.toFixed(2)} across ${r.polyps} settled polyp${r.polyps === 1 ? "" : "s"}`);
  }

  // Exploration floor: unearned seeds keep a seat so new names can still prove themselves.
  for (const s of seed) {
    if (symbols.length >= max) break;
    take(s, "exploration seed");
  }

  return { symbols, basis: "reef", reasons };
}
