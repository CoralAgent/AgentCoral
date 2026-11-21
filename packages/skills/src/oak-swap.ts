/**
 * The gated on-chain execution path.
 *
 * resolve → quote → risk gate → fill.
 *
 * In paper mode the swap is simulated against the real Chainbridge quote — the
 * notional, fees and quantities CORAL would have had — and lands in the
 * ledger as a paper fill tagged `oak`. In live mode the same quote feeds
 * Chainbridge's prepare → execute flow: `swap` builds the exact-approval transaction
 * set, `oak_execute` signs it. Nothing signs unless the verdict allowed it
 * AND the caller passed `confirm: true` — the same double opt-in every other
 * venue in CORAL honours.
 */
import { randomUUID } from "node:crypto";
import type { CoralMemory, Decision, LedgerEntry, RiskManager, RiskState, RiskVerdict } from "@coral/core";
import { toBaseUnits, type OakMcp, type OakQuote } from "./oak-mcp.js";

export interface OnchainSwapOpts {
  oak: OakMcp;
  memory: CoralMemory;
  risk: RiskManager;
  mode: "paper" | "live";
  /** Token to sell — symbol or 0x address. */
  from: string;
  /** Token to buy — symbol or 0x address. */
  to: string;
  /** Human units of `from`, e.g. "0.01". */
  amountHuman: string;
  /** Live signing requires true; anything else is a dry run. */
  confirm: boolean;
  /** Resolve → quote → gate only. Returns "dry-run" before any fill or signature. */
  preview?: boolean;
  /** Computes the gate's view for a resolved symbol (exposure, daily P&L, loss streak). */
  riskStateFor: (symbol: string) => RiskState;
  slippageBps?: number;
  confidence?: number;
}

export interface OnchainSwapResult {
  stage: "rejected" | "dry-run" | "filled";
  verdict: RiskVerdict;
  quote?: OakQuote;
  txHash?: string;
  entry?: LedgerEntry;
  polypId?: string;
  notes: string[];
}

const USDG = "USDG";

function extractActionId(prepared: unknown): string | null {
  const hit = JSON.stringify(prepared).match(/"actionId"\s*:\s*"([^"]+)"/);
  return hit?.[1] ?? null;
}

function extractTxHash(executed: unknown): string | undefined {
  const hit = JSON.stringify(executed).match(/"(?:transactionHash|txHash|hash)"\s*:\s*"(0x[0-9a-fA-F]{64})"/);
  return hit?.[1];
}

export async function onchainSwap(o: OnchainSwapOpts): Promise<OnchainSwapResult> {
  const notes: string[] = [];
  await o.oak.connect();

  const fromInfo = await o.oak.resolveToken(o.from);
  const toInfo = await o.oak.resolveToken(o.to);
  const amountIn = toBaseUnits(o.amountHuman, fromInfo.decimals);

  let quote = await o.oak.quote({
    from: fromInfo.address,
    to: toInfo.address,
    amountIn,
    ...(o.slippageBps !== undefined ? { slippageBps: o.slippageBps } : {}),
  });
  if (!quote.quoteId) {
    throw new Error(quote.notice ?? "Chainbridge returned no quote");
  }
  if (quote.priceImpactWarning) notes.push(quote.priceImpactWarning);
  if (quote.feeDisclosure) notes.push(quote.feeDisclosure);

  // Price everything in USD via USDG, the same reference Chainbridge uses. The `to`
  // token's price comes off the quote itself — implied output per USD in —
  // because the reverse direction (token→USDG) is not always quotable.
  const notionalUsd =
    fromInfo.symbol === USDG
      ? Number(o.amountHuman)
      : (await o.oak.usdValue(fromInfo.address, o.amountHuman)) ?? 0;
  const expectedOutRaw = Number(quote.output?.humanAmount ?? NaN);
  const toUsd =
    toInfo.symbol === USDG
      ? 1
      : Number.isFinite(expectedOutRaw) && expectedOutRaw > 0 && notionalUsd > 0
        ? notionalUsd / expectedOutRaw
        : ((await o.oak.usdValue(toInfo.address, "1")) ?? 0);

  const decision: Decision = {
    symbol: toInfo.symbol,
    action: "buy",
    confidence: o.confidence ?? 0.75,
    thesis: `manual on-chain swap ${o.amountHuman} ${fromInfo.symbol} → ${toInfo.symbol}`,
    tags: ["onchain", "chainbridge", "manual"],
    recalled: [],
  };

  const verdict = o.risk.review(
    { decision, price: toUsd, requestedNotional: notionalUsd },
    { ...o.riskStateFor(toInfo.symbol), mode: o.mode },
  );
  if (!verdict.allowed) return { stage: "rejected", verdict, quote, notes };

  // The gate scaled the order down: re-quote the smaller amount so the live
  // order and the ledger agree on what was actually swapped.
  let effectiveIn = o.amountHuman;
  if (verdict.scaledFrom !== undefined && notionalUsd > 0) {
    const scale = verdict.notional / notionalUsd;
    effectiveIn = (Number(o.amountHuman) * scale).toPrecision(12);
    notes.push(`re-quoted at ${(scale * 100).toFixed(1)}% of request to honour risk cap`);
    quote = await o.oak.quote({
      from: fromInfo.address,
      to: toInfo.address,
      amountIn: toBaseUnits(effectiveIn, fromInfo.decimals),
      ...(o.slippageBps !== undefined ? { slippageBps: o.slippageBps } : {}),
    });
    if (!quote.quoteId) throw new Error(quote.notice ?? "Chainbridge returned no quote on re-quote");
  }

  const expectedOut = Number(quote.output?.humanAmount ?? NaN);
  const minOut = Number(quote.minimumOutput?.humanAmount ?? NaN);

  // ── preview: the caller saw the quote and the gate's verdict — stop ──────
  if (o.preview) {
    notes.push("preview only — nothing signed, nothing recorded");
    return { stage: "dry-run", verdict, quote, notes };
  }

  // ── paper: simulate the fill against the real quote ──────────────────────
  if (o.mode === "paper" || !o.confirm) {
    if (o.mode === "live" && !o.confirm) {
      return { stage: "dry-run", verdict, quote, notes };
    }
    const { qty, fees } = o.risk.fill(verdict.notional, toUsd);
    const entry: LedgerEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      mode: "paper",
      symbol: toInfo.symbol,
      side: "buy",
      qty,
      price: toUsd,
      notional: verdict.notional,
      polypId: null,
      status: "filled",
      venue: "chainbridge",
    };
    o.memory.record(entry);
    const polyp = o.memory.grow({
      kind: "trade",
      agent: "coral",
      symbol: toInfo.symbol,
      thesis: decision.thesis,
      action: "buy",
      confidence: decision.confidence,
      outcome: "pending",
      pnl: 0,
      tags: [...decision.tags, "paper"],
      artifacts: { quote, fees, venue: "chainbridge", from: fromInfo.symbol, amountIn: effectiveIn },
    });
    notes.push(`paper fill: ${qty.toFixed(6)} ${toInfo.symbol} @ $${toUsd} (fees $${fees.toFixed(2)})`);
    return { stage: "filled", verdict, quote, entry, polypId: polyp.id, notes };
  }

  // ── live: prepare → execute, after the gate said yes ─────────────────────
  const prepared = await o.oak.swap({
    from: fromInfo.address,
    to: toInfo.address,
    amountIn: toBaseUnits(effectiveIn, fromInfo.decimals),
    quoteId: quote.quoteId,
    ...(o.slippageBps !== undefined ? { slippageBps: o.slippageBps } : {}),
  });
  const actionId = extractActionId(prepared);
  if (!actionId) {
    throw new Error(
      `Chainbridge did not prepare an executable action: ${JSON.stringify(prepared).slice(0, 300)}`,
    );
  }
  const executed = await o.oak.oakExecute(actionId);
  const txHash = extractTxHash(executed);

  const qty = Number.isFinite(minOut) ? minOut : expectedOut;
  const entry: LedgerEntry = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    mode: "live",
    symbol: toInfo.symbol,
    side: "buy",
    qty: Number.isFinite(qty) ? qty : 0,
    price: toUsd,
    notional: verdict.notional,
    polypId: null,
    status: txHash ? "filled" : "pending",
    venue: "chainbridge",
  };
  o.memory.record(entry);
  const polyp = o.memory.grow({
    kind: "trade",
    agent: "coral",
    symbol: toInfo.symbol,
    thesis: decision.thesis,
    action: "buy",
    confidence: decision.confidence,
    outcome: "pending",
    pnl: 0,
    tags: [...decision.tags, "live"],
    artifacts: { quote, prepared, executed, venue: "chainbridge", from: fromInfo.symbol, amountIn: effectiveIn, txHash },
  });
  return { stage: "filled", verdict, quote, txHash, entry, polypId: polyp.id, notes };
}
