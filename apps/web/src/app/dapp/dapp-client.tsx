"use client";

/**
 * The dApp surface — talks only to `coral api` on 127.0.0.1:7331.
 *
 * Nothing here signs anything. Swaps go through the same two-step the CLI
 * uses: preview (resolve → quote → gate) then confirm (paper fill, or live
 * signature only when the API runs `-m live`). If the API is down the page
 * says so and shows how to start it — it never fabricates a state.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PrivyWalletSection } from "./privy-wallet";

const API = "http://127.0.0.1:7331";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

interface Health {
  ok: boolean;
  mode: string;
  reasoner: string;
  home: string;
  uptimeSec: number;
}

let apiToken = "";
function headers(): Record<string, string> {
  return apiToken ? { authorization: `Bearer ${apiToken}` } : {};
}

async function get(path: string): Promise<Any> {
  const r = await fetch(`${API}${path}`, { cache: "no-store", headers: headers() });
  const body = await r.json();
  if (r.status === 401) return { ok: false, unauthorized: true, ...body };
  return body;
}
async function post(path: string, body: object): Promise<Any> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify(body),
  });
  return r.json();
}

const mono = "font-mono-code";
const input =
  "w-full border border-rule bg-white px-3 py-2 font-mono-code text-[11px] text-ink placeholder:text-ink-soft focus:border-cobalt focus:outline-none";
const btn =
  "border border-rule-cobalt px-4 py-2 font-sans-clean text-[10px] font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-cobalt hover:bg-cobalt hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rule-cobalt disabled:hover:bg-transparent disabled:hover:text-ink";
const btnDanger =
  "border border-[#B3261E] px-4 py-2 font-sans-clean text-[10px] font-medium uppercase tracking-[0.12em] text-[#B3261E] transition-colors hover:bg-[#B3261E] hover:text-white disabled:opacity-40";

function fmtUsd(n: number | string | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Section({ title, note, id, children }: { title: string; note?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-24">
      <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">{title}</h2>
      {note && <p className="mt-2 max-w-[560px] font-sans-clean text-[11px] font-medium leading-[1.45] text-ink-muted">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MiniChart({ bars }: { bars: { t: string; close: number }[] }) {
  if (bars.length < 2) return null;
  const w = 720, h = 110, pad = 6;
  const min = Math.min(...bars.map((b) => b.close));
  const max = Math.max(...bars.map((b) => b.close));
  const range = max - min || 1;
  const pts = bars
    .map((b, i) => `${(pad + (i / (bars.length - 1)) * (w - 2 * pad)).toFixed(1)},${(h - pad - ((b.close - min) / range) * (h - 2 * pad)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--color-cobalt, #2743ce)" strokeWidth="1.5" />
    </svg>
  );
}

export function DappClient() {
  const [health, setHealth] = useState<Health | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [wallet, setWallet] = useState<Any>(null);
  const [positions, setPositions] = useState<Any>(null);
  const [series, setSeries] = useState<Record<string, { t: string; close: number }[]>>({});
  const [chartSym, setChartSym] = useState<string>("");

  const [tokenQ, setTokenQ] = useState("");
  const [tokenRes, setTokenRes] = useState<Any>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  const [scanSyms, setScanSyms] = useState("USDG");
  const [scanVenue, setScanVenue] = useState<"oak" | "equity">("oak");
  const [scanRes, setScanRes] = useState<Any>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const [from, setFrom] = useState("USDG");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("5");
  const [preview, setPreview] = useState<Any>(null);
  const [swapRes, setSwapRes] = useState<Any>(null);
  const [swapBusy, setSwapBusy] = useState<"idle" | "preview" | "confirm">("idle");

  const refresh = useCallback(async () => {
    try {
      const h = (await get("/api/health")) as Health & { unauthorized?: boolean };
      if (h.unauthorized) {
        setUnauthorized(true);
        setApiState("online");
        return;
      }
      if (!h.ok) throw new Error("unhealthy");
      setUnauthorized(false);
      setHealth(h);
      setApiState("online");
      const [w, p, s] = await Promise.all([
        get("/api/wallet").catch(() => null),
        get("/api/positions").catch(() => null),
        get("/api/token-series").catch(() => null),
      ]);
      setWallet(w);
      setPositions(p);
      const ser = (s?.series ?? {}) as Record<string, { t: string; close: number }[]>;
      setSeries(ser);
      setChartSym((cur) => cur || Object.keys(ser)[0] || "");
    } catch {
      setApiState("offline");
    }
  }, []);

  useEffect(() => {
    apiToken = localStorage.getItem("coral.api.token") ?? "";
    setTokenInput(apiToken);
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const account = (wallet?.account ?? {}) as Any;
  const balanceItems = (wallet?.balances?.items ?? []) as Any[];

  const offlinePanel = (
    <div className="mt-6 border border-rule-cobalt bg-[#F8F9FE] px-6 py-8">
      <h2 className="font-serif-display text-[24px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
        Public view — no agent attached
      </h2>
      <p className="mt-3 max-w-[560px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
        Your wallet above works fully in this browser — the agent&apos;s sections need{" "}
        <code className="font-mono-code text-cobalt">coral api</code> running on 127.0.0.1:7331, which only the
        operator&apos;s machine can provide. Browse the <Link href="/reef" className="text-cobalt underline underline-offset-4">reef snapshot</Link> for
        what the agent has been doing.
      </p>
      <pre className="mt-5 overflow-x-auto border border-rule-cobalt bg-white px-4 py-3 font-mono-code text-[11px] leading-[1.7] text-ink">
        <code>{`# operator: run this, then reload\npnpm coral api`}</code>
      </pre>
    </div>
  );

  const tokenPanel = (
    <div className="mt-6 border border-rule-cobalt bg-[#F8F9FE] px-6 py-8">
      <h2 className="font-serif-display text-[24px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
        The api wants a token
      </h2>
      <p className="mt-3 max-w-[560px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
        <code className="font-mono-code text-cobalt">CORAL_API_TOKEN</code> is set on the api — required when it
        binds beyond loopback (docker-compose sets <code className="font-mono-code">coral-local</code>). It is
        kept in this browser&apos;s localStorage only, and sent as a bearer header.
      </p>
      <form
        className="mt-5 flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          apiToken = tokenInput.trim();
          localStorage.setItem("coral.api.token", apiToken);
          void refresh();
        }}
      >
        <div className="w-72">
          <Field label="CORAL_API_TOKEN">
            <input type="password" className={input} value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
          </Field>
        </div>
        <button className={btn}>connect</button>
      </form>
    </div>
  );

  return (
    <div>
      {/* status strip */}
      <div className="flex flex-wrap items-center gap-2.5 border border-rule bg-white px-4 py-3 font-mono-code text-[10px] text-ink-soft">
        <span className={`inline-block h-2 w-2 rounded-full ${apiState === "online" ? "bg-cobalt" : "bg-ink-muted"}`} />
        <span className="text-cobalt">{apiState === "online" ? "api online" : "api offline · public view"}</span>
        <span aria-hidden>·</span>
        <span>{health?.mode?.toUpperCase() ?? "—"}</span>
        <span aria-hidden>·</span>
        <span>{health?.reasoner ?? "—"} reasoner</span>
        <span aria-hidden>·</span>
        <span>deployed {fmtUsd(positions?.deployedUsd)}</span>
        <span className="ml-auto">
          <Link href="/reef" className="text-cobalt underline underline-offset-4 hover:text-ink">
            the reef ↗
          </Link>
        </span>
      </div>

      {/* visitor wallet — privy embedded, works for anyone, not the agent's */}
      <Section
        title="Your wallet"
        note="Your own embedded wallet on Robinhood Chain — sign in your browser, fund it yourself. Entirely separate from the agent's wallet below."
      >
        <PrivyWalletSection />
      </Section>

      {apiState === "offline" && offlinePanel}
      {apiState !== "offline" && unauthorized && tokenPanel}

      {apiState === "online" && !unauthorized && (
        <>
      {/* wallet */}
      <Section title="Agent wallet" note="The Chainbridge wallet the CLI holds in this machine's keychain — read through the api, never through the page.">
        <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
          <div className="bg-white px-5 py-5">
            <p className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>address</p>
            <p className={`${mono} mt-2 break-all text-[12px] text-ink`}>{account.wallet ?? account.address ?? "—"}</p>
            <p className={`${mono} mt-3 text-[10px] text-ink-soft`}>
              chain {account.chainId ?? 4663} · key in {account.keyProtection ?? "os keychain"}
            </p>
            <p className={`${mono} mt-1 text-[10px] ${account.actionsUnlocked ? "text-cobalt" : "text-[#B3261E]"}`}>
              {account.actionsUnlocked ? "actions unlocked" : "actions locked — run coral onchain setup"}
            </p>
          </div>
          <div className="bg-white px-5 py-5">
            <p className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>balances</p>
            {balanceItems.length === 0 ? (
              <p className={`${mono} mt-2 text-[10.5px] text-ink-soft`}>{wallet?.balances?.summary ?? "none reported"}</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {balanceItems.slice(0, 6).map((b: Any, i: number) => (
                  <li key={i} className={`${mono} flex justify-between text-[10.5px] text-ink`}>
                    <span>{b.token?.symbol ?? "?"}</span>
                    <span>
                      {b.humanAmount ?? "0"} · {fmtUsd(b.usdEstimate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* token viewer */}
      <Section title="Token viewer" note="Resolve any symbol or 0x address through Chainbridge's verified registry — lookalikes surface as warnings, not silent picks.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!tokenQ.trim()) return;
            setTokenBusy(true);
            setTokenRes(await get(`/api/token?q=${encodeURIComponent(tokenQ.trim())}`).catch((er) => ({ error: String(er) })));
            setTokenBusy(false);
          }}
        >
          <div className="w-64">
            <Field label="symbol or 0x address">
              <input className={input} value={tokenQ} onChange={(e) => setTokenQ(e.target.value)} placeholder="USDG or 0x5fc5…" />
            </Field>
          </div>
          <button className={btn} disabled={tokenBusy}>{tokenBusy ? "resolving…" : "resolve"}</button>
        </form>
        {tokenRes && (
          <div className="mt-4 border border-rule bg-white px-4 py-3">
            {tokenRes.error ? (
              <p className={`${mono} text-[10.5px] text-[#B3261E]`}>{tokenRes.error}</p>
            ) : tokenRes.resolved ? (
              <div className={`${mono} text-[10.5px] leading-[1.8] text-ink`}>
                <p>
                  <span className="text-cobalt">{tokenRes.resolved.symbol}</span> — {tokenRes.resolved.name ?? "unnamed"}
                </p>
                <p className="break-all text-ink-soft">{tokenRes.resolved.address}</p>
                <p className="text-ink-soft">
                  {tokenRes.resolved.decimals} decimals · chain {tokenRes.resolved.chainId} ·{" "}
                  {tokenRes.resolved.verified ? "verified" : "unverified"} · {tokenRes.resolved.kind ?? "token"}
                </p>
                {(tokenRes.resolved.warnings ?? []).map((w: string, i: number) => (
                  <p key={i} className="text-[#B3261E]">⚠ {w}</p>
                ))}
              </div>
            ) : (
              <p className={`${mono} text-[10.5px] text-ink-soft`}>
                no verified match — {tokenRes.unverified?.length ?? 0} unverified candidates
              </p>
            )}
          </div>
        )}
      </Section>

      {/* scan */}
      <Section id="scan" title="Scan" note="A full engine pass — observe, recall, reason, gate — with maxOrders 0. It writes polyps, never orders.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setScanBusy(true);
            const symbols = scanSyms.split(",").map((s) => s.trim()).filter(Boolean);
            setScanRes(await post("/api/scan", { symbols, venue: scanVenue }).catch((er) => ({ error: String(er) })));
            setScanBusy(false);
            void refresh();
          }}
        >
          <div className="w-64">
            <Field label="symbols (comma separated)">
              <input className={input} value={scanSyms} onChange={(e) => setScanSyms(e.target.value)} placeholder="USDG" />
            </Field>
          </div>
          <div className="w-28">
            <Field label="venue">
              <select className={input} value={scanVenue} onChange={(e) => setScanVenue(e.target.value as "oak" | "equity")}>
                <option value="oak">onchain</option>
                <option value="equity">equity</option>
              </select>
            </Field>
          </div>
          <button className={btn} disabled={scanBusy || !scanSyms.trim()}>{scanBusy ? "scanning…" : "scan"}</button>
        </form>
        {scanRes?.report && (
          <div className="mt-4 grid gap-px border border-rule bg-rule md:grid-cols-2">
            {scanRes.report.decisions.map((d: Any, i: number) => {
              const obs = scanRes.report.observations.find((o: Any) => o.symbol === d.symbol);
              const verdict = scanRes.report.verdicts[i];
              return (
                <div key={i} className="bg-white px-4 py-4">
                  <div className="flex items-baseline justify-between">
                    <span className={`${mono} text-[12px] font-medium text-ink`}>{d.symbol}</span>
                    <span className={`${mono} text-[10px] uppercase ${d.action === "buy" ? "text-cobalt" : d.action === "sell" ? "text-[#B3261E]" : "text-ink-soft"}`}>
                      {d.action} · conf {Number(d.confidence).toFixed(2)}
                    </span>
                  </div>
                  {obs && (
                    <p className={`${mono} mt-2 text-[10px] text-ink-soft`}>
                      {fmtUsd(obs.price)} · rsi {Number(obs.rsi14).toFixed(0)} · mom {(Number(obs.momentum20) * 100).toFixed(1)}% · via {obs.source}
                    </p>
                  )}
                  <p className="mt-2 font-sans-clean text-[11px] leading-[1.45] text-ink/85">{d.thesis}</p>
                  {verdict && (
                    <p className={`${mono} mt-2 text-[9.5px] ${verdict.allowed ? "text-cobalt" : "text-[#B3261E]"}`}>
                      gate: {verdict.allowed ? "allowed" : `refused — ${verdict.reasons?.join("; ")}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {scanRes?.error && <p className={`${mono} mt-3 text-[10.5px] text-[#B3261E]`}>{scanRes.error}</p>}
      </Section>

      {/* swap */}
      <Section
        title="Swap"
        note="Two steps, same as the CLI: preview shows the live Chainbridge quote and the gate's verdict; confirm runs it — a paper fill unless the api was started with -m live. Nothing signs on step one."
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSwapBusy("preview");
            setSwapRes(null);
            setPreview(await post("/api/swap/preview", { from, to, amount }).catch((er) => ({ error: String(er) })));
            setSwapBusy("idle");
          }}
        >
          <div className="w-32"><Field label="from"><input className={input} value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} placeholder="USDG" /></Field></div>
          <div className="w-32"><Field label="to"><input className={input} value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} placeholder="token symbol" /></Field></div>
          <div className="w-32"><Field label="amount"><input className={input} value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(null); }} /></Field></div>
          <button className={btn} disabled={swapBusy !== "idle"}>
            {swapBusy === "preview" ? "quoting…" : "1 · preview"}
          </button>
          <button
            type="button"
            className={health?.mode === "live" ? btnDanger : btn}
            disabled={!preview?.ok || preview.stage !== "dry-run" || preview.verdict?.allowed !== true || swapBusy !== "idle"}
            onClick={async () => {
              setSwapBusy("confirm");
              setSwapRes(await post("/api/swap", { from, to, amount, confirm: true }).catch((er) => ({ error: String(er) })));
              setSwapBusy("idle");
              setPreview(null);
              void refresh();
            }}
          >
            {swapBusy === "confirm" ? "running…" : `2 · confirm ${health?.mode === "live" ? "LIVE" : "paper"} swap`}
          </button>
        </form>

        {preview && (
          <div className="mt-4 border border-rule bg-white px-4 py-4">
            {preview.error ? (
              <p className={`${mono} text-[10.5px] text-[#B3261E]`}>{preview.error}</p>
            ) : (
              <>
                <p className={`${mono} text-[11px] text-ink`}>
                  {amount} {from.toUpperCase()} → {preview.quote?.output?.humanAmount ?? "?"} {preview.quote?.output?.token?.symbol ?? to.toUpperCase()}
                  <span className="text-ink-soft"> · min {preview.quote?.minimumOutput?.humanAmount ?? "?"}</span>
                </p>
                <p className={`${mono} mt-1.5 text-[9.5px] ${preview.verdict?.allowed ? "text-cobalt" : "text-[#B3261E]"}`}>
                  gate: {preview.verdict?.allowed ? `allowed · notional $${Number(preview.verdict.notional).toFixed(2)}` : `refused — ${preview.verdict?.reasons?.join("; ")}`}
                </p>
                {(preview.notes ?? []).map((n: string, i: number) => (
                  <p key={i} className={`${mono} mt-1 text-[9.5px] text-ink-soft`}>{n}</p>
                ))}
                {preview.quote?.feeDisclosure && <p className={`${mono} mt-1 text-[9.5px] text-ink-soft`}>{preview.quote.feeDisclosure}</p>}
              </>
            )}
          </div>
        )}

        {swapRes && (
          <div className="mt-4 border border-rule bg-white px-4 py-4">
            {swapRes.error ? (
              <p className={`${mono} text-[10.5px] text-[#B3261E]`}>{swapRes.error}</p>
            ) : (
              <>
                <p className={`${mono} text-[11px] ${swapRes.stage === "filled" ? "text-cobalt" : "text-ink"}`}>
                  {swapRes.stage}: {swapRes.entry ? `${swapRes.entry.qty?.toFixed?.(4) ?? swapRes.entry.qty} ${swapRes.entry.symbol} @ ${fmtUsd(swapRes.entry.price)} (${swapRes.entry.mode})` : "see notes"}
                </p>
                {swapRes.txHash && <p className={`${mono} mt-1 break-all text-[9.5px] text-ink-soft`}>tx {swapRes.txHash}</p>}
                {(swapRes.notes ?? []).map((n: string, i: number) => (
                  <p key={i} className={`${mono} mt-1 text-[9.5px] text-ink-soft`}>{n}</p>
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      {/* series + positions */}
      <Section title="What the reef is watching" note="Bars sampled from live Chainbridge quotes, plus the open paper positions in the ledger.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-rule bg-white px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>token series</span>
              {Object.keys(series).length > 0 && (
                <select className={`${mono} border border-rule bg-white px-1 py-0.5 text-[10px] text-ink`} value={chartSym} onChange={(e) => setChartSym(e.target.value)}>
                  {Object.keys(series).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
            {chartSym && (series[chartSym]?.length ?? 0) >= 2 ? (() => {
              const bars = series[chartSym]!;
              return (
                <>
                  <div className="mt-2"><MiniChart bars={bars} /></div>
                  <div className="mt-1 flex justify-between font-mono-code text-[9px] text-ink-soft">
                    <span>{bars.length} bars</span>
                    <span>last {fmtUsd(bars[bars.length - 1]?.close)}</span>
                  </div>
                </>
              );
            })() : (
              <p className={`${mono} mt-3 text-[10px] text-ink-soft`}>
                {Object.keys(series).length === 0 ? "no series yet — run a scan on a token first" : "needs 2+ samples for a chart"}
              </p>
            )}
          </div>
          <div className="border border-rule bg-white px-4 py-3">
            <span className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>open positions</span>
            {(positions?.positions ?? []).length === 0 ? (
              <p className={`${mono} mt-3 text-[10px] text-ink-soft`}>none</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {positions.positions.map((p: Any, i: number) => (
                  <li key={i} className={`${mono} flex justify-between text-[10.5px] text-ink`}>
                    <span>{p.symbol}</span>
                    <span>{p.qty >= 1 ? p.qty.toFixed(2) : p.qty.toPrecision(4)} · {fmtUsd(p.cost)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={`${mono} mt-3 border-t border-rule pt-2 text-[9.5px] text-ink-soft`}>
              deployed {fmtUsd(positions?.deployedUsd)} of the paper budget
            </p>
          </div>
        </div>
      </Section>

      <p className="mt-14 max-w-[640px] font-sans-clean text-[11px] leading-[1.5] text-ink-soft">
        Live swaps need the api started with <code className="font-mono-code text-[10.5px] text-cobalt">coral -m live api</code>,
        a funded Chainbridge wallet, an ERC-8004 identity, and the gate&apos;s yes — the same rules as the terminal. See{" "}
        <Link href="/safety" className="text-cobalt underline underline-offset-4 hover:text-ink">the safety page</Link>{" "}
        for what the gate enforces.
      </p>
        </>
      )}
    </div>
  );
}
