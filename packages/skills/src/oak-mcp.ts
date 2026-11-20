/**
 * Chainbridge Agent Kit MCP client — stdio.
 *
 * Chainbridge (`@oakagentkit/addon`) runs a local MCP server (`oak mcp`) that bridges
 * an agent to ~35 projects on Robinhood Chain: token discovery, balances,
 * prices, DEX quotes, swaps, lending, bridges. Unlike the Robinhood trading
 * MCP this is a local stdio process CORAL spawns, so no token is required —
 * the private key lives in the OS keychain and never touches CORAL.
 *
 * Reads are free. Actions (swap, send, lend, ...) are behind Chainbridge's own
 * prepare → execute flow: a prepared action returns an actionId plus a
 * simulated summary, and nothing is signed until `oak_execute` is called.
 * CORAL's risk manager takes the role Chainbridge gives to the human "yes in chat":
 * execute() only ever runs after a verdict says allowed.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpToolInfo } from "./robinhood-mcp.js";

export interface OakMcpOptions {
  /** Command used to spawn `oak mcp`, e.g. "oak" or "npx -y @oakagentkit/addon". */
  command: string;
  args: string[];
}

export interface OakTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  name?: string;
  kind?: string;
  verified?: boolean;
  warnings?: string[];
}

export interface OakQuote {
  quoteId: string;
  provider?: string;
  expiresAt?: string;
  amountOut?: string;
  minAmountOut?: string;
  oakFeeBps?: number;
  feeDisclosure?: string;
  priceImpact?: string;
  priceImpactWarning?: string;
  input?: { token?: OakTokenInfo; amount?: string; humanAmount?: string };
  output?: { token?: OakTokenInfo; amount?: string; humanAmount?: string };
  minimumOutput?: { humanAmount?: string };
  notice?: string;
}

/** Convert a human amount ("0.01") to a base-unit string using decimals. */
export function toBaseUnits(human: string, decimals: number): string {
  const [whole = "0", frac = ""] = human.trim().split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const value = BigInt((whole || "0") + padded);
  return value.toString();
}

export class OakMcp {
  private client: Client | null = null;
  private tools: McpToolInfo[] = [];

  constructor(private readonly opts: OakMcpOptions) {}

  get connected(): boolean {
    return this.client !== null;
  }

  /** Spawn `oak mcp` and discover tools. Idempotent. */
  async connect(): Promise<void> {
    if (this.client) return;
    const transport = new StdioClientTransport({
      command: this.opts.command,
      args: this.opts.args,
      stderr: "pipe",
    });
    const client = new Client({ name: "coral", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    this.client = client;
    const res = await client.listTools();
    this.tools = res.tools.map((t) => ({ name: t.name, description: t.description ?? "" }));
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.tools = [];
  }

  listTools(): McpToolInfo[] {
    return this.tools;
  }

  /** Call one Chainbridge tool by name; throws with Chainbridge's own message on failure. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) throw new Error("OakMcp not connected — call connect() first");
    const res = await this.client.callTool({ name, arguments: args });
    const { content, isError } = res as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };
    const joined = (content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    if (isError) throw new Error(`oak ${name}: ${joined || "tool error"}`);
    try {
      return JSON.parse(joined) as unknown;
    } catch {
      return joined;
    }
  }

  // ── typed wrappers over the named tools ─────────────────────────────────

  async findToken(query: string): Promise<{ matches: OakTokenInfo[]; unverified: OakTokenInfo[] }> {
    const res = await this.call("find_token", { query });
    const obj = (typeof res === "string" ? {} : res) as {
      matches?: OakTokenInfo[];
      unverified?: OakTokenInfo[];
    };
    return { matches: obj.matches ?? [], unverified: obj.unverified ?? [] };
  }

  /** Resolve a symbol or address to one verified token, or throw. */
  async resolveToken(query: string): Promise<OakTokenInfo> {
    if (/^0[xX][0-9a-fA-F]{40}$/.test(query)) {
      const { matches, unverified } = await this.findToken(query);
      const token = [...matches, ...unverified].find(
        (t) => t.address.toLowerCase() === query.toLowerCase(),
      );
      if (!token) throw new Error(`no token found at ${query}`);
      return token;
    }
    const { matches } = await this.findToken(query);
    const verified = matches.filter((t) => t.verified !== false && t.kind !== "launchpad");
    if (verified.length === 0) {
      throw new Error(`no verified token matching "${query}" — unverified lookalikes exist; use an address`);
    }
    // Several verified tokens can share a query (OAK → chOAK, schOAK, OAK).
    // Exact symbol wins over prefix order; wrapped kinds lose to their base.
    const exact = verified.find((t) => t.symbol.toUpperCase() === query.toUpperCase());
    return exact ?? verified.find((t) => t.kind !== "wrapped") ?? verified[0]!;
  }

  /**
   * USD price for a token. Uses `price` when the pool is fresh; falls back to
   * a 1 USDG → token quote, which Chainbridge keeps quotable even when `price` bails
   * on a stale pool.
   */
  async usdPrice(token: string): Promise<number | null> {
    try {
      const res = await this.call("price", { token });
      if (typeof res === "string") return null;
      const usdE18 = (res as { usdE18?: string }).usdE18;
      if (!usdE18) return null;
      return Number(BigInt(usdE18)) / 1e18;
    } catch {
      return null;
    }
  }

  async quote(o: { from: string; to: string; amountIn: string; slippageBps?: number }): Promise<OakQuote> {
    const res = await this.call("quote", {
      from: o.from,
      to: o.to,
      amountIn: o.amountIn,
      ...(o.slippageBps !== undefined ? { slippageBps: o.slippageBps } : {}),
    });
    return (typeof res === "string" ? { quoteId: "", notice: res } : res) as OakQuote;
  }

  /** USD value of `amountHuman` units of `token`, priced via a quote to USDG. Null when the route is unquotable. */
  async usdValue(token: string, amountHuman: string): Promise<number | null> {
    try {
      const info = await this.resolveToken(token);
      const q = await this.quote({
        from: info.address,
        to: "USDG",
        amountIn: toBaseUnits(amountHuman, info.decimals),
      });
      const out = Number(q.output?.humanAmount ?? NaN);
      return Number.isFinite(out) ? out : null;
    } catch {
      return null;
    }
  }

  async balances(): Promise<unknown> {
    return this.call("balances");
  }

  async positions(deepScan = false): Promise<unknown> {
    return this.call("positions", { deepScan });
  }

  async account(): Promise<unknown> {
    return this.call("account");
  }

  /** Prepare a swap. Returns Chainbridge's prepared action (actionId + summary). */
  async swap(o: { from: string; to: string; amountIn: string; quoteId: string; slippageBps?: number }): Promise<unknown> {
    return this.call("swap", {
      from: o.from,
      to: o.to,
      amountIn: o.amountIn,
      quoteId: o.quoteId,
      ...(o.slippageBps !== undefined ? { slippageBps: o.slippageBps } : {}),
    });
  }

  /** Sign and broadcast a prepared action. The point of no return. */
  async oakExecute(actionId: string): Promise<unknown> {
    return this.call("oak_execute", { actionId });
  }

  /** Generic prepare for non-listed tools (lend, bridge, send, ...). */
  async oakPrepare(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call("oak_prepare", { name, arguments: args });
  }
}
