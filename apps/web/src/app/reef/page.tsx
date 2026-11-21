import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Footer, Header } from "@/components/chrome";
import { DiagonalArrow } from "@/components/engraving";
import { PageBackdrop, PageHero } from "@/components/page-hero";
import { readReef, readTokenSeries } from "@/lib/reef";

export const metadata: Metadata = {
  title: "The reef",
  description: "A read-only window onto the reef on this machine: polyps, ledger, generations, zones.",
};

const OUTCOME_TONE: Record<string, string> = {
  win: "text-cobalt",
  loss: "text-[#B3261E]",
  neutral: "text-ink-soft",
  pending: "text-ink-muted",
};

/** Sub-cent tokens must not round to $0.00. */
function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function SeriesChart({ symbol, bars }: { symbol: string; bars: { t: string; close: number }[] }) {
  if (bars.length < 2) {
    return (
      <p className="border border-rule px-4 py-3 font-mono-code text-[10px] text-ink-soft">
        {symbol}: {bars.length} sample{bars.length === 1 ? "" : "s"} — the series needs more observations before a
        chart means anything.
      </p>
    );
  }
  const w = 720;
  const h = 120;
  const pad = 6;
  const min = Math.min(...bars.map((b) => b.close));
  const max = Math.max(...bars.map((b) => b.close));
  const range = max - min || 1;
  const pts = bars
    .map(
      (b, i) =>
        `${(pad + (i / (bars.length - 1)) * (w - 2 * pad)).toFixed(1)},${(
          h -
          pad -
          ((b.close - min) / range) * (h - 2 * pad)
        ).toFixed(1)}`,
    )
    .join(" ");
  const last = bars[bars.length - 1]!;
  return (
    <div className="border border-rule bg-white px-4 py-3">
      <div className="flex items-baseline justify-between font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">
        <span className="text-cobalt">{symbol}</span>
        <span>
          last {fmtUsd(last.close)} · {bars.length} bars
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-28 w-full" preserveAspectRatio="none" role="img">
        <polyline points={pts} fill="none" stroke="var(--color-cobalt, #2743ce)" strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between font-mono-code text-[9px] text-ink-soft">
        <span>{fmtUsd(min)}</span>
        <span>{fmtUsd(max)}</span>
      </div>
    </div>
  );
}

export default async function ReefPage() {
  const reef = await readReef();
  const series = readTokenSeries();
  const charted = Object.entries(series)
    .filter(([, bars]) => bars.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4);

  return (
    <>
      <Header />
      <main className="relative">
        <PageBackdrop />
        <div className="relative z-10">
          <PageHero
            eyebrow="The reef"
            title={
              <>
                This machine&apos;s
                <br />
                colony
              </>
            }
          >
            Read straight out of the SQLite file the CLI writes. No API, no second copy of the truth, and no invented
            numbers on this page.
          </PageHero>

          <div className="mx-auto max-w-[1220px] px-6 py-12 sm:px-10">
          {!reef.available ? (
            <div className="border border-rule-cobalt bg-[#F8F9FE] px-6 py-8">
              <h2 className="font-serif-display text-[24px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
                No reef here yet
              </h2>
              <p className="mt-3 max-w-[560px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
                {reef.error
                  ? `A reef exists at ${reef.dbPath} but could not be read: ${reef.error}`
                  : `Nothing at ${reef.dbPath}. Spawn one, run a pass, then reload this page.`}
              </p>
              <pre className="mt-5 overflow-x-auto border border-rule-cobalt bg-white px-4 py-3 font-mono-code text-[11px] leading-[1.7] text-ink">
                <code>{`pnpm coral init
pnpm coral trade NVDA,AAPL --budget 200
pnpm web            # then reload`}</code>
              </pre>
            </div>
          ) : (
            <>
              {reef.source === "snapshot" && (
                <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 border border-rule-cobalt bg-[#F8F9FE] px-4 py-3 font-mono-code text-[10px] text-ink-soft">
                  <span className="inline-block h-2 w-2 rounded-full bg-cobalt" />
                  <span className="text-cobalt">published snapshot</span>
                  <span aria-hidden>·</span>
                  <span>
                    exported {reef.publishedAt ? new Date(reef.publishedAt).toLocaleString() : "at an unknown time"} via{" "}
                    <code className="text-cobalt">coral publish</code> — a frozen copy of the operator&apos;s reef,
                    not live state
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
                {[
                  ["generation", String(reef.generation)],
                  ["polyps", String(reef.counts.polyps)],
                  ["win rate", reef.counts.wins + reef.counts.losses > 0 ? `${(reef.winRate * 100).toFixed(1)}%` : "n/a"],
                  ["realised", `${reef.realised >= 0 ? "" : "-"}$${Math.abs(reef.realised).toFixed(2)}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-5 py-6">
                    <p className="font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">{label}</p>
                    <p className="mt-2 font-serif-display text-[30px] font-normal leading-none text-cobalt">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 font-mono-code text-[10px] text-ink-soft">
                <span className="text-cobalt">{reef.mode.toUpperCase()}</span>
                <span aria-hidden>·</span>
                <span>deployed ${reef.deployed.toFixed(2)}</span>
                <span aria-hidden>·</span>
                <span>
                  {reef.counts.wins}W / {reef.counts.losses}L · {reef.counts.pending} pending
                </span>
                <span aria-hidden>·</span>
                <span>
                  spawned {reef.spawnedAt ? formatDistanceToNow(new Date(reef.spawnedAt), { addSuffix: true }) : "n/a"}
                </span>
                <span aria-hidden>·</span>
                <Link href="/dapp" className="text-cobalt underline underline-offset-4 hover:text-ink">
                  open the dApp
                </Link>
              </div>

              {charted.length > 0 && (
                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                    Token series
                  </h2>
                  <p className="mt-2 max-w-[560px] font-sans-clean text-[11px] font-medium leading-[1.45] text-ink-muted">
                    Bars the agent sampled from live Chainbridge quotes — one per observation, stored in
                    token-series.json. Not candles, not a feed: exactly what the reef saw.
                  </p>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {charted.map(([symbol, bars]) => (
                      <SeriesChart key={symbol} symbol={symbol} bars={bars} />
                    ))}
                  </div>
                </section>
              )}

              {reef.zones.length > 0 && (
                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                    Zones
                  </h2>
                  <p className="mt-2 max-w-[560px] font-sans-clean text-[11px] font-medium leading-[1.45] text-ink-muted">
                    Strength is a Laplace-smoothed win rate, so three lucky wins do not read as a hundred percent
                    edge. Bookkeeping tags are excluded, because being allowed to trade is not the same as having an
                    edge.
                  </p>
                  <div className="mt-5 grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
                    {reef.zones.map((z) => {
                      const decided = z.wins + z.losses;
                      return (
                        <div key={z.name} className="flex items-center gap-3">
                          <span className="w-32 shrink-0 truncate font-mono-code text-[10.5px] text-ink">{z.name}</span>
                          <span className="relative h-1.5 flex-1 overflow-hidden bg-rule">
                            <span
                              className={`absolute inset-y-0 left-0 ${
                                z.strength >= 0.6 ? "bg-cobalt" : z.strength < 0.42 ? "bg-[#B3261E]" : "bg-ink-muted"
                              }`}
                              style={{ width: `${Math.round(z.strength * 100)}%` }}
                            />
                          </span>
                          <span className="w-24 shrink-0 text-right font-mono-code text-[10px] text-ink-soft">
                            {decided === 0 ? "untested" : `${(z.strength * 100).toFixed(0)}% · ${z.polyps}p`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="mt-14">
                <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                  Recent polyps
                </h2>
                <div className="mt-4 overflow-x-auto border border-rule">
                  <table className="w-full text-left">
                    <thead className="border-b border-rule font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">
                      <tr>
                        <th className="px-4 py-3 font-normal">when</th>
                        <th className="px-4 py-3 font-normal">kind</th>
                        <th className="px-4 py-3 font-normal">symbol</th>
                        <th className="px-4 py-3 font-normal">act</th>
                        <th className="px-4 py-3 font-normal">conf</th>
                        <th className="px-4 py-3 font-normal">outcome</th>
                        <th className="hidden px-4 py-3 font-normal md:table-cell">thesis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                      {reef.polyps.map((p) => (
                        <tr key={p.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 font-mono-code text-[10px] text-ink-soft">
                            {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
                          </td>
                          <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-muted">{p.kind}</td>
                          <td className="px-4 py-3 font-mono-code text-[11px] font-medium text-ink">{p.symbol ?? "—"}</td>
                          <td className="px-4 py-3 font-mono-code text-[10.5px] uppercase text-ink-muted">{p.action}</td>
                          <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-soft">
                            {p.confidence.toFixed(2)}
                          </td>
                          <td className={`px-4 py-3 font-mono-code text-[10.5px] ${OUTCOME_TONE[p.outcome] ?? "text-ink-muted"}`}>
                            {p.outcome}
                          </td>
                          <td className="hidden max-w-[26rem] px-4 py-3 font-sans-clean text-[11px] leading-relaxed text-ink/80 md:table-cell">
                            <span className="line-clamp-2">{p.thesis}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {reef.ledger.length > 0 && (
                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">Ledger</h2>
                  <div className="mt-4 overflow-x-auto border border-rule">
                    <table className="w-full text-left">
                      <thead className="border-b border-rule font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">
                        <tr>
                          <th className="px-4 py-3 font-normal">when</th>
                          <th className="px-4 py-3 font-normal">venue</th>
                          <th className="px-4 py-3 font-normal">symbol</th>
                          <th className="px-4 py-3 font-normal">side</th>
                          <th className="px-4 py-3 font-normal">notional</th>
                          <th className="px-4 py-3 font-normal">qty</th>
                          <th className="px-4 py-3 font-normal">price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {reef.ledger.map((l) => (
                          <tr key={l.id}>
                            <td className="whitespace-nowrap px-4 py-3 font-mono-code text-[10px] text-ink-soft">
                              {formatDistanceToNow(new Date(l.ts), { addSuffix: true })}
                            </td>
                            <td className="px-4 py-3 font-mono-code text-[10px] text-ink-soft">{l.venue}</td>
                            <td className="px-4 py-3 font-mono-code text-[11px] font-medium text-ink">{l.symbol}</td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] uppercase text-ink-muted">{l.side}</td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink">${l.notional.toFixed(2)}</td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-soft">
                              {l.qty >= 1 ? l.qty.toFixed(2) : l.qty.toPrecision(4)}
                            </td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink">{fmtUsd(l.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {reef.generations.length > 0 && (
                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                    Generations
                  </h2>
                  <ul className="mt-4 border-t border-rule">
                    {reef.generations.map((g) => (
                      <li key={g.id} className="border-b border-rule py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono-code text-[10.5px] text-cobalt">gen {g.generation}</span>
                          <span className="font-mono-code text-[10px] text-ink-soft">
                            {formatDistanceToNow(new Date(g.ts), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="mt-2 max-w-[720px] font-sans-clean text-[11.5px] leading-relaxed text-ink/85">
                          {g.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="mt-14 font-sans-clean text-[11px] text-ink-soft">
                Reload after any{" "}
                <code className="font-mono-code text-[10.5px] text-cobalt">coral</code> command to watch the reef
                move.{" "}
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center gap-1 text-cobalt underline underline-offset-4 hover:text-ink"
                >
                  How these rows are produced
                  <DiagonalArrow className="h-2.5 w-2.5" />
                </Link>
              </p>
            </>
          )}
        </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
