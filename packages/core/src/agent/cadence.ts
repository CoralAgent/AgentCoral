/**
 * Phase 5: the reef decides when to look again.
 *
 * A schedule is a human's guess about when the market will be interesting.
 * This replaces it with rules over the reef's own state: polyps past
 * settlement age pull the next pass to the floor — the reef owes the
 * market a grade — a maturing polyp gets visited the minute it can be
 * graded, an active tape shortens the wait, and a quiet tape lets the
 * reef wait longer. Deterministic, bounded, always logged with its reason.
 */
import type { Observation } from "../memory/types.js";

/** Mirrors the engine's settle floor: a decision needs an hour before the market can grade it. */
const SETTLE_FLOOR_MS = 60 * 60 * 1000;
/** Slack added on top of a maturity arrival so the pass never fires a minute early. */
const MATURITY_SLACK_MS = 60 * 1000;
/** A maturing polyp only drives the cadence inside this window before its floor. */
const MATURITY_WINDOW_MS = 15 * 60 * 1000;

export interface CadenceOptions {
  /** baseline minutes from daemon.json */
  baseMinutes: number;
  /** hard floor — the reef never hot-loops */
  minMinutes?: number;
  /** hard ceiling — the reef never goes dark */
  maxMinutes?: number;
  /** the pass just observed these (empty before the first pass) */
  observations: Observation[];
  /** ages of unsettled decision/trade polyps, in ms */
  pendingAgeMs: number[];
}

export interface CadenceDecision {
  minutes: number;
  reason: string;
}

export function decideCadence(opts: CadenceOptions): CadenceDecision {
  const base = Math.max(1, opts.baseMinutes);
  const min = opts.minMinutes ?? 5;
  const max = opts.maxMinutes ?? 240;
  const clamp = (m: number): number => Math.min(max, Math.max(min, m));

  // Polyps past settlement age: the reef owes the market a grade. Look now.
  const mature = opts.pendingAgeMs.filter((age) => age >= SETTLE_FLOOR_MS).length;
  if (mature > 0) {
    return {
      minutes: min,
      reason: `${mature} polyp${mature === 1 ? "" : "s"} past settlement age — the reef owes the market a grade`,
    };
  }

  // A polyp maturing soon: arrive the minute it can be graded, not sooner.
  const soonest = opts.pendingAgeMs.filter((a) => a < SETTLE_FLOOR_MS).sort((a, b) => b - a)[0];
  if (soonest !== undefined && SETTLE_FLOOR_MS - soonest <= MATURITY_WINDOW_MS) {
    const minutes = clamp(Math.ceil((SETTLE_FLOOR_MS - soonest + MATURITY_SLACK_MS) / 60_000));
    return { minutes, reason: "a polyp matures soon — visiting the minute the market can grade it" };
  }

  // An active tape shortens the wait.
  const bigMove = opts.observations.find((o) => Math.abs(o.change24h) >= 0.04);
  if (bigMove) {
    return {
      minutes: clamp(Math.round(base / 2)),
      reason: `${bigMove.symbol} moved ${(bigMove.change24h * 100).toFixed(1)}% — the tape is active`,
    };
  }
  const extreme = opts.observations.find((o) => o.rsi14 <= 30 || o.rsi14 >= 70);
  if (extreme) {
    return {
      minutes: clamp(Math.round(base * 0.75)),
      reason: `${extreme.symbol} rsi ${extreme.rsi14.toFixed(0)} — stretched, worth re-reading`,
    };
  }

  // A quiet tape lets the reef wait longer.
  if (
    opts.observations.length > 0 &&
    opts.observations.every((o) => Math.abs(o.change24h) < 0.01 && o.rsi14 > 40 && o.rsi14 < 60)
  ) {
    return { minutes: clamp(Math.round(base * 1.5)), reason: "quiet tape — every watched name is flat" };
  }

  return { minutes: clamp(base), reason: "baseline" };
}
