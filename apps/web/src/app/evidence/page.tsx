import type { Metadata } from "next";
import { Footer, Header } from "@/components/chrome";
import { PageBackdrop, PageHero } from "@/components/page-hero";
import { readEvidence } from "@/lib/evidence";
import type { EvidenceData } from "@/lib/evidence";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Hit rate, edge per zone, and drawdown — computed from settled polyps in the published reef snapshot, not asserted.",
};

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toPrecision(3)}`;
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white px-5 py-6">
      <p className="font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className="mt-2 font-serif-display text-[30px] font-normal leading-none text-cobalt">{value}</p>
      {sub && <p className="mt-1.5 font-mono-code text-[9.5px] text-ink-soft">{sub}</p>}
    </div>
  );
}

function UntestedMark() {
  return <span className="font-mono-code text-[10px] text-ink-muted">untested</span>;
}

function EdgeBar({ edge }: { edge: number }) {
  return (
    <span className="relative h-1.5 w-28 shrink-0 overflow-hidden bg-rule">
      <span
        className={`absolute inset-y-0 left-0 ${edge >= 0.6 ? "bg-cobalt" : edge < 0.42 ? "bg-[#B3261E]" : "bg-ink-muted"}`}
        style={{ width: `${Math.round(edge * 100)}%` }}
      />
    </span>
  );
}

function ZoneTable({ zones }: { zones: EvidenceData["zones"] }) {
  return (
    <div className="overflow-x-auto border border-rule">
      <table className="w-full text-left">
        <thead className="border-b border-rule font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">
          <tr>
            <th className="px-4 py-3 font-normal">zone (tag)</th>
            <th className="px-4 py-3 font-normal">edge</th>
            <th className="px-4 py-3 font-normal">decided</th>
            <th className="px-4 py-3 font-normal">W / L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {zones.map((z) => (
            <tr key={z.name}>
              <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink">{z.name}</td>
              <td className="px-4 py-3">
                {z.edge === null || z.decided < 3 ? (
                  <UntestedMark />
                ) : (
                  <span className="flex items-center gap-3">
                    <EdgeBar edge={z.edge} />
                    <span className="font-mono-code text-[10px] text-ink-soft">{(z.edge * 100).toFixed(0)}%</span>
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-soft">{z.decided}</td>
              <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-soft">
                {z.wins}W / {z.losses}L
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EvidencePage() {
  const ev = readEvidence();

  // A percentage needs earned evidence. Twelve settles that are ten flat
  // holds and two lucky wins must not render as a 100% hit rate — the
  // honest state gates on decided polyps, not raw settled count.
  const decidedCount = ev.wins + ev.losses;
  const young = !ev.available || decidedCount < 5;

  return (
    <>
      <Header />
      <main className="relative">
        <PageBackdrop />
        <div className="relative z-10">
          <PageHero
            eyebrow="Evidence"
            title={
              <>
                Computed,
                <br />
                not claimed
              </>
            }
          >
            Every number on this page is calculated at build time from settled polyps in the published snapshot.
            Nothing here is asserted by copy — if the reef has not earned a statistic, the page says so.
          </PageHero>

          <div className="mx-auto max-w-[1220px] px-6 py-12 sm:px-10">
            {ev.source === "snapshot" && (
              <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 border border-rule-cobalt bg-[#F8F9FE] px-4 py-3 font-mono-code text-[10px] text-ink-soft">
                <span className="inline-block h-2 w-2 rounded-full bg-cobalt" />
                <span className="text-cobalt">published snapshot</span>
                <span aria-hidden>·</span>
                <span>
                  computed from the frozen reef committed to this repo
                  {ev.publishedAt ? `, published ${new Date(ev.publishedAt).toLocaleString()}` : ""} — not live state
                </span>
              </div>
            )}

            {!ev.available ? (
              <div className="border border-rule-cobalt bg-[#F8F9FE] px-6 py-8">
                <h2 className="font-serif-display text-[24px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
                  No evidence to compute
                </h2>
                <p className="mt-3 max-w-[560px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
                  {ev.error
                    ? `The snapshot exists but could not be read: ${ev.error}`
                    : "No reef snapshot was found in this build. Without a snapshot there is no track record — and this page will not invent one."}
                </p>
              </div>
            ) : young ? (
              <div className="border border-rule-cobalt bg-[#F8F9FE] px-6 py-8">
                <h2 className="font-serif-display text-[24px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
                  The reef is young
                </h2>
                <p className="mt-3 max-w-[560px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
                  {ev.settled} polyp{ev.settled === 1 ? "" : "s"} settled so far, but only {decidedCount} ha{decidedCount === 1 ? "s" : "ve"} actually decided —
                  the rest are holds that settled flat. {decidedCount} outcomes is not a hit rate. This page will
                  mean something when there are more.
                </p>
                <p className="mt-2 max-w-[560px] font-sans-clean text-[11px] leading-[1.5] text-ink-muted">
                  Two decided outcomes do not make a hit rate. Publishing a percentage off a handful of settles is
                  exactly the behaviour this page exists to refuse — so for now it shows the raw counts and waits.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
                  <StatCell label="settled" value={String(ev.settled)} sub={`${decidedCount} decided`} />
                  <StatCell label="pending" value={String(ev.pending)} />
                  <StatCell label="hits / misses" value={`${ev.wins}W / ${ev.losses}L`} />
                  <StatCell label="realised" value={fmtUsd(ev.realised)} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
                  <StatCell
                    label="hit rate"
                    value={ev.hitRate === null ? "n/a" : `${(ev.hitRate * 100).toFixed(1)}%`}
                    sub={`${ev.wins}W / ${ev.losses}L decided`}
                  />
                  <StatCell label="settled" value={String(ev.settled)} sub={`${ev.pending} still pending`} />
                  <StatCell label="realised" value={fmtUsd(ev.realised)} sub="settled pnl, snapshot only" />
                  <StatCell
                    label="max drawdown"
                    value={ev.maxDrawdown === null ? "none" : fmtUsd(ev.maxDrawdown)}
                    sub={
                      ev.maxDrawdown === null
                        ? `curve never declined across ${ev.curvePoints} settles`
                        : `peak-to-trough over ${ev.curvePoints} settles`
                    }
                  />
                </div>

                <p className="mt-4 max-w-[620px] font-sans-clean text-[11px] font-medium leading-[1.5] text-ink-muted">
                  Hit rate counts wins against decided polyps only — wins plus losses. Neutral settles are holds,
                  and a hold that settles flat is not a free win. Pending polyps count toward nothing.
                </p>

                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                    Edge per zone
                  </h2>
                  <p className="mt-2 max-w-[560px] font-sans-clean text-[11px] font-medium leading-[1.45] text-ink-muted">
                    Laplace-smoothed win rate per tag, so a handful of lucky settles cannot read as a hundred
                    percent edge. Zones with fewer than three decided polyps are labelled untested — no percentage
                    is offered, because none has been earned.
                  </p>
                  <div className="mt-5">
                    <ZoneTable zones={ev.zones} />
                  </div>
                </section>

                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                    Per symbol
                  </h2>
                  <div className="mt-5 overflow-x-auto border border-rule">
                    <table className="w-full text-left">
                      <thead className="border-b border-rule font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">
                        <tr>
                          <th className="px-4 py-3 font-normal">symbol</th>
                          <th className="px-4 py-3 font-normal">decided</th>
                          <th className="px-4 py-3 font-normal">W / L</th>
                          <th className="px-4 py-3 font-normal">realised</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {ev.symbols.map((s) => (
                          <tr key={s.symbol}>
                            <td className="px-4 py-3 font-mono-code text-[11px] font-medium text-ink">{s.symbol}</td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-soft">{s.decided}</td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink-soft">
                              {s.wins}W / {s.losses}L
                            </td>
                            <td className="px-4 py-3 font-mono-code text-[10.5px] text-ink">{fmtUsd(s.realised)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="mt-14">
                  <h2 className="font-serif-editorial text-[20px] font-normal tracking-[-0.01em] text-cobalt">
                    Confidence calibration
                  </h2>
                  <p className="mt-2 max-w-[560px] font-sans-clean text-[11px] font-medium leading-[1.45] text-ink-muted">
                    Settled win rate bucketed by the confidence the decision was made at. If higher confidence does
                    not actually correlate with wins, that is a fact about the reef worth publishing too.
                  </p>
                  <div className="mt-5 grid gap-px border border-rule bg-rule sm:grid-cols-3">
                    {ev.calibration.map((b) => (
                      <div key={b.label} className="bg-white px-5 py-6">
                        <p className="font-mono-code text-[9.5px] uppercase tracking-[0.12em] text-ink-soft">
                          {b.label}
                        </p>
                        <p className="mt-2 font-serif-display text-[26px] font-normal leading-none text-cobalt">
                          {b.decided < 3 ? (
                            <span className="font-mono-code text-[11px] normal-case text-ink-muted">untested</span>
                          ) : (
                            `${((b.wins / b.decided) * 100).toFixed(0)}%`
                          )}
                        </p>
                        <p className="mt-1.5 font-mono-code text-[9.5px] text-ink-soft">
                          {b.wins}W of {b.decided} decided
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            <p className="mt-14 font-sans-clean text-[11px] text-ink-soft">
              Numbers update when a new snapshot is published — the page itself is static, computed once per build.
              There are no benchmarks on this page because there is nothing to benchmark against yet.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
