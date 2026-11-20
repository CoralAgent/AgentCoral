/**
 * coral api — the reef's local HTTP surface.
 *
 * Binds 127.0.0.1 only. This is the dApp backend: the web UI on localhost
 * talks to it, the public site never sees it. Custody and the risk gate
 * stay inside this process.
 *
 * Browser safety: a random website could otherwise drive a local agent
 * through the visitor's browser (the classic local-RPC attack). Every
 * request carrying an Origin header must come from a loopback origin —
 * curl and other non-browser clients send no Origin and pass.
 *
 * Write surface: /api/swap goes through the same resolve → quote → gate →
 * fill pipeline as `coral onchain swap`. `confirm: true` is still required
 * for a live signature; nothing here bypasses RiskManager.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evolve } from "@coral/core";
import { onchainSwap, toBaseUnits } from "@coral/skills";
import type { Runtime } from "./runtime.js";
import { parseSymbols } from "./runtime.js";

export const API_VERSION = 1;
const MAX_BODY = 64 * 1024;

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

type Json = Record<string, unknown> | unknown[];

function send(res: ServerResponse, status: number, body: Json, origin: string | null): void {
  const payload = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...(origin ? { "access-control-allow-origin": origin, vary: "origin" } : {}),
  });
  res.end(payload);
}

function err(res: ServerResponse, status: number, message: string, origin: string | null): void {
  send(res, status, { ok: false, error: message }, origin);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(buf);
  }
  if (!size) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function startApi(rt: Runtime, port: number, version: string, host = "127.0.0.1"): Promise<Server> {
  const startedAt = Date.now();
  const token = process.env.CORAL_API_TOKEN?.trim() || null;

  // Binding beyond loopback puts a wallet-adjacent API on the network. Only
  // allowed with an explicit bearer token — the origin gate stops browsers,
  // but curl sends no Origin, so auth is the backstop.
  if (!LOOPBACK_HOSTS.has(host) && !token) {
    throw new Error(
      `refusing to bind ${host} without CORAL_API_TOKEN — ` +
        `a non-loopback api can be reached by anything on the network`,
    );
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method ?? "GET";

    // ── origin gate ────────────────────────────────────────────────────
    const origin = req.headers.origin ?? null;
    if (origin && !LOOPBACK_ORIGIN.test(origin)) {
      return err(res, 403, "origin not allowed — the api only answers loopback origins", null);
    }
    if (method === "OPTIONS") {
      res.writeHead(204, {
        ...(origin ? { "access-control-allow-origin": origin, vary: "origin" } : {}),
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
        "access-control-max-age": "600",
      });
      res.end();
      return;
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      return err(res, 401, "unauthorized — set CORAL_API_TOKEN on the client", origin);
    }

    const q = url.searchParams;
    const limit = Math.min(Math.max(Number(q.get("limit")) || 20, 1), 500);

    try {
      switch (`${method} ${path}`) {
        // ── health & state ────────────────────────────────────────────
        case "GET /api/health":
          return send(res, 200, {
            ok: true,
            api: API_VERSION,
            coral: version,
            mode: rt.config.mode,
            reasoner: rt.engine.reasoner,
            home: rt.config.home,
            uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
          }, origin);

        case "GET /api/status": {
          const snap = rt.memory.snapshot();
          return send(res, 200, {
            ok: true,
            mode: rt.config.mode,
            reasoner: rt.engine.reasoner,
            model: rt.engine.reasoner === "llm" ? rt.config.model : null,
            snapshot: { ...snap, zones: snap.zones.slice(0, 50) },
            deployedUsd: rt.memory.deployedCapital(),
            positions: rt.memory.openPositions(),
            limits: rt.risk.limits,
          }, origin);
        }

        case "GET /api/reef":
          return send(res, 200, { ok: true, polyps: rt.memory.latest(limit) }, origin);

        case "GET /api/reef/recall": {
          const query = q.get("q") ?? q.get("symbol") ?? "";
          if (!query) return err(res, 400, "pass ?q= or ?symbol=", origin);
          return send(res, 200, {
            ok: true,
            hits: rt.memory.recall({
              query,
              ...(q.get("symbol") ? { symbol: q.get("symbol") } : {}),
              limit,
            }),
          }, origin);
        }

        case "GET /api/ledger":
          return send(res, 200, { ok: true, entries: rt.memory.ledger(limit) }, origin);

        case "GET /api/positions":
          return send(res, 200, {
            ok: true,
            positions: rt.memory.openPositions(),
            deployedUsd: rt.memory.deployedCapital(),
          }, origin);

        case "GET /api/generations":
          return send(res, 200, { ok: true, evolutions: rt.memory.evolutions(limit) }, origin);

        case "GET /api/zones":
          return send(res, 200, { ok: true, zones: rt.memory.zones() }, origin);

        // ── oak / on-chain reads ───────────────────────────────────────
        case "GET /api/wallet": {
          await rt.oak.connect();
          const [account, balances, positions] = await Promise.all([
            rt.oak.account().catch((e) => ({ error: String(e) })),
            rt.oak.balances().catch((e) => ({ error: String(e) })),
            rt.oak.positions().catch((e) => ({ error: String(e) })),
          ]);
          return send(res, 200, { ok: true, account, balances, positions }, origin);
        }

        case "GET /api/quote": {
          const from = str(q.get("from"));
          const to = str(q.get("to"));
          const amount = str(q.get("amount"));
          if (!from || !to || !amount) return err(res, 400, "pass ?from=&to=&amount=", origin);
          await rt.oak.connect();
          const [fromInfo, toInfo] = await Promise.all([
            rt.oak.resolveToken(from),
            rt.oak.resolveToken(to),
          ]);
          const slippage = q.get("slippageBps");
          const quote = await rt.oak.quote({
            from: fromInfo.address,
            to: toInfo.address,
            amountIn: toBaseUnits(amount, fromInfo.decimals),
            ...(slippage ? { slippageBps: Number(slippage) } : {}),
          });
          return send(res, 200, {
            ok: true,
            from: fromInfo,
            to: toInfo,
            amountHuman: amount,
            quote,
          }, origin);
        }

        case "GET /api/token": {
          const query = str(q.get("q"));
          if (!query) return err(res, 400, "pass ?q= — symbol or 0x address", origin);
          await rt.oak.connect();
          const found = await rt.oak.findToken(query);
          const resolved = /^0x[0-9a-fA-F]{40}$/.test(query) || /^[A-Z0-9]{1,10}$/i.test(query)
            ? await rt.oak.resolveToken(query).catch(() => null)
            : null;
          return send(res, 200, { ok: true, resolved, ...found }, origin);
        }

        case "GET /api/token-series": {
          const file = join(rt.config.home, "token-series.json");
          if (!existsSync(file)) return send(res, 200, { ok: true, series: {} }, origin);
          const all = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
          const symbol = str(q.get("symbol"));
          return send(res, 200, {
            ok: true,
            series: symbol ? { [symbol]: all[symbol] ?? [] } : all,
          }, origin);
        }

        // ── engine ────────────────────────────────────────────────────
        case "POST /api/scan": {
          const body = await readBody(req);
          const symbols = parseSymbols(body.symbols as string | string[] | undefined);
          if (!symbols.length) return err(res, 400, "pass symbols: [] — e.g. [\"OAK\"] or [\"AAPL\"]", origin);
          const venue = str(body.venue) ?? (symbols.some((s) => s.startsWith("0x")) ? "oak" : "equity");
          const source = venue === "oak" ? rt.tokenSource : rt.source;
          const report = await rt.engine.scan(symbols, source);
          return send(res, 200, { ok: true, venue, report }, origin);
        }

        // ── gated execution ────────────────────────────────────────────
        case "POST /api/swap/preview":
        case "POST /api/swap": {
          const body = await readBody(req);
          const from = str(body.from);
          const to = str(body.to);
          const amount = str(body.amount);
          if (!from || !to || !amount) return err(res, 400, "pass { from, to, amount }", origin);
          const preview = path.endsWith("/preview");
          const result = await onchainSwap({
            oak: rt.oak,
            memory: rt.memory,
            risk: rt.risk,
            mode: rt.config.mode,
            from,
            to,
            amountHuman: amount,
            confirm: body.confirm === true,
            preview,
            riskStateFor: (symbol) => rt.engine.riskStateFor(symbol),
            ...(body.slippageBps !== undefined ? { slippageBps: Number(body.slippageBps) } : {}),
            ...(body.confidence !== undefined ? { confidence: Number(body.confidence) } : {}),
          });
          return send(res, result.stage === "rejected" ? 200 : 200, { ok: true, ...result }, origin);
        }

        case "POST /api/evolve": {
          const body = await readBody(req).catch(() => ({}) as Record<string, unknown>);
          const result = evolve(rt.memory, {
            ...(body.dryRun === true ? { dryRun: true } : {}),
            ...(body.minSamples !== undefined ? { minSamples: Number(body.minSamples) } : {}),
          });
          rt.router.syncZones(rt.memory.zones());
          return send(res, 200, { ok: true, result }, origin);
        }

        default:
          return err(res, 404, `no route: ${method} ${path}`, origin);
      }
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : String(e), origin);
    }
  };

  const server = createServer((req, res) => {
    void handler(req, res).catch((e) =>
      err(res, 500, e instanceof Error ? e.message : "internal error", null),
    );
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
