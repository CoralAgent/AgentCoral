/**
 * Chainbridge Agent Kit skills — Robinhood Chain DeFi through the Chainbridge MCP.
 *
 * Same contract as the Robinhood MCP skills: thin typed wrappers with
 * scorable triggers. They *read* — or they hand an order to Chainbridge after the
 * engine has already gated it. `oak.swap` exists so the venue is visible to
 * the router; it must never be invoked outside a gated execution path.
 */
import type { Skill } from "@coral/core";
import { toBaseUnits, type OakMcp } from "./oak-mcp.js";

export interface OakSkillDeps {
  /** Lazily resolves the client so status works before `oak mcp` spawns. */
  oak: () => OakMcp;
}

export function oakSkills(deps: OakSkillDeps): Skill[] {
  const client = () => deps.oak();

  const findToken: Skill = {
    name: "oak.find-token",
    description: "Resolve a Robinhood Chain token by name, symbol or address — verified tokens and lookalike warnings.",
    triggers: ["find token", "token address", "contract address", "which token", "token discovery"],
    tags: ["oak", "chain", "market-data"],
    available: () => client().connected,
    run: async (ctx) => {
      const mcp = client();
      await mcp.connect();
      return mcp.findToken(String(ctx.query ?? ctx.token ?? ctx.symbol ?? ""));
    },
  };

  const price: Skill = {
    name: "oak.price",
    description: "USD price of an on-chain token on Robinhood Chain (fresh pool quote; stale pools are refused).",
    triggers: ["token price", "onchain price", "how much is", "price of", "token quote"],
    tags: ["oak", "chain", "market-data"],
    available: () => client().connected,
    run: async (ctx) => {
      const token = String(ctx.token ?? ctx.symbol ?? "");
      if (!token) throw new Error("oak.price needs ctx.token");
      const mcp = client();
      await mcp.connect();
      const usd = await mcp.usdPrice(token);
      const implied = usd ?? (await mcp.usdValue(token, "1"));
      if (implied === null) throw new Error(`no price for ${token}`);
      return { token, priceUsd: implied, via: usd !== null ? "price" : "quote" };
    },
  };

  const balances: Skill = {
    name: "oak.balances",
    description: "Token balances of the local Chainbridge wallet on Robinhood Chain.",
    triggers: ["wallet balances", "onchain balances", "my tokens", "wallet holdings"],
    tags: ["oak", "chain", "portfolio"],
    available: () => client().connected,
    run: async () => {
      const mcp = client();
      await mcp.connect();
      return mcp.balances();
    },
  };

  const positions: Skill = {
    name: "oak.positions",
    description: "Aggregated DeFi positions of the Chainbridge wallet across Robinhood Chain projects.",
    triggers: ["defi positions", "onchain positions", "open positions", "vaults", "lending positions"],
    tags: ["oak", "chain", "portfolio"],
    available: () => client().connected,
    run: async (ctx) => {
      const mcp = client();
      await mcp.connect();
      return mcp.positions(ctx.deepScan === true);
    },
  };

  const quote: Skill = {
    name: "oak.quote",
    description: "Best-route DEX quote for a token swap on Robinhood Chain (KyberSwap/Velora/Pons/pinned Uniswap).",
    triggers: ["swap quote", "dex quote", "best route", "how much would i get", "exchange rate"],
    tags: ["oak", "chain", "execution", "market-data"],
    available: () => client().connected,
    run: async (ctx) => {
      const from = String(ctx.from ?? "");
      const to = String(ctx.to ?? "");
      const amount = String(ctx.amount ?? ctx.amountHuman ?? "");
      if (!from || !to || !amount) throw new Error("oak.quote needs ctx.from, ctx.to and ctx.amount");
      const mcp = client();
      await mcp.connect();
      const fromInfo = await mcp.resolveToken(from);
      return mcp.quote({
        from: fromInfo.address,
        to,
        amountIn: toBaseUnits(amount, fromInfo.decimals),
        ...(ctx.slippageBps !== undefined ? { slippageBps: Number(ctx.slippageBps) } : {}),
      });
    },
  };

  const account: Skill = {
    name: "oak.account",
    description: "Chainbridge wallet state: address, ERC-8004 identity, actions lock, spending cap, setup progress.",
    triggers: ["oak wallet", "oak status", "agent identity", "wallet setup", "spending limit"],
    tags: ["oak", "chain", "diagnostics"],
    available: () => client().connected,
    run: async () => {
      const mcp = client();
      await mcp.connect();
      return mcp.account();
    },
  };

  const swap: Skill = {
    name: "oak.swap",
    description:
      "Execute a token swap on Robinhood Chain via Chainbridge. Never call directly — the engine hands off only after the risk gate allows it, and only in live mode.",
    triggers: ["swap token", "execute swap", "trade token", "buy token", "sell token"],
    tags: ["oak", "chain", "execution"],
    available: () => client().connected,
    run: async (ctx) => {
      const mcp = client();
      await mcp.connect();
      const args = ctx.oakSwap;
      if (!args || typeof args !== "object") throw new Error("oak.swap needs ctx.oakSwap");
      return mcp.swap(args as { from: string; to: string; amountIn: string; quoteId: string });
    },
  };

  const execute: Skill = {
    name: "oak.execute",
    description: "Sign and broadcast a prepared Chainbridge action by actionId. Engine-only — called after the gate says yes.",
    triggers: ["execute action", "sign transaction", "broadcast"],
    tags: ["oak", "chain", "execution"],
    available: () => client().connected,
    run: async (ctx) => {
      const mcp = client();
      await mcp.connect();
      const actionId = String(ctx.actionId ?? "");
      if (!actionId) throw new Error("oak.execute needs ctx.actionId");
      return mcp.oakExecute(actionId);
    },
  };

  return [findToken, price, balances, positions, quote, account, swap, execute];
}
