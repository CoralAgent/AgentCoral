"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The reef map — layout B.
 *
 * Zones are the unit the router actually weights prompts by, so they are the
 * right thing to put on the canvas: each card is a zone, and clicking one shows
 * the evidence behind it. The connectors are not decoration; they are drawn
 * between fixed slots so the lattice never breaks when the zone count changes.
 *
 * Slots are deterministic (2 rows of 3) rather than measured. Measuring would
 * mean refs, a resize observer and a redraw on every font swap, and it buys
 * nothing here: past six zones the map stops being readable anyway, so the
 * seventh onward collapse into a count.
 */
const API = "http://127.0.0.1:7331";

interface Zone {
  name: string;
  polyps: number;
  wins: number;
  losses: number;
  strength: number;
  lastSeen: string | null;
}

/** Fixed slot centres, in percent of the canvas. */
const SLOTS = [
  { x: 20, y: 27 },
  { x: 50, y: 21 },
  { x: 80, y: 27 },
  { x: 22, y: 68 },
  { x: 52, y: 74 },
  { x: 80, y: 68 },
] as const;

/** Edges by slot index. Kept sparse — a full mesh reads as a spiderweb. */
const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 5],
  [3, 4],
  [4, 5],
];

function token(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("coral.api.token") ?? "";
}

function since(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One zone, as a card. Shared by the map (absolute slots) and the phone grid. */
function ZoneCard({
  zone,
  strength,
  selected,
  onSelect,
}: {
  zone: Zone;
  strength: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full border bg-white px-3 py-2.5 text-left shadow-[0_2px_14px_-8px_rgba(10,20,60,.35)] transition-colors sm:px-3.5 ${
        selected ? "border-cobalt" : "border-rule-cobalt/60 hover:border-cobalt/60"
      }`}
    >
      <p className="truncate font-mono-code text-[10.5px] uppercase tracking-[0.06em] text-ink">{zone.name}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-serif-display text-[19px] leading-none text-cobalt">{zone.polyps}</span>
        <span className="font-mono-code text-[8.5px] uppercase tracking-[0.12em] text-ink-soft">
          polyp{zone.polyps === 1 ? "" : "s"}
        </span>
      </p>
      {/* strength bar: the number that decides prompt weight */}
      <span className="mt-2 block h-[3px] w-full bg-rule" aria-hidden>
        <span className="block h-full bg-cobalt" style={{ width: `${Math.round(strength * 100)}%` }} />
      </span>
      <p className="mt-1.5 flex items-center justify-between font-mono-code text-[8.5px] uppercase tracking-[0.1em] text-ink-soft">
        <span>
          {zone.wins}w · {zone.losses}l
        </span>
        <span>{Math.round(strength * 100)}%</span>
      </p>
    </button>
  );
}

export function ReefMap({
  fallbackZones,
  fallbackSource,
  fallbackAt,
}: {
  fallbackZones?: Zone[];
  fallbackSource?: "live" | "snapshot" | null;
  fallbackAt?: string | null;
}) {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [state, setState] = useState<"loading" | "online" | "snapshot" | "offline">("loading");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/zones`, {
        cache: "no-store",
        headers: token() ? { authorization: `Bearer ${token()}` } : {},
      });
      if (!r.ok) throw new Error(String(r.status));
      const body = await r.json();
      setZones((body.zones ?? []) as Zone[]);
      setState("online");
    } catch {
      if (fallbackZones) {
        setZones(fallbackZones);
        setState("snapshot");
      } else {
        setState("offline");
      }
    }
  }, [fallbackZones]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const all = zones ?? [];
  const shown = all.slice(0, SLOTS.length);
  const overflow = all.length - shown.length;
  const pick = all.find((z) => z.name === selected) ?? null;

  return (
    <section className="relative border border-rule-cobalt bg-white/85 backdrop-blur-[1px]">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-5 py-3">
        <p className="font-mono-code text-[9px] uppercase tracking-[0.2em] text-cobalt">The reef</p>
        <span className="h-3 w-px bg-rule" aria-hidden />
        <p className="font-sans-clean text-[10.5px] text-ink-muted">
          zones the router weights your prompts by
        </p>
        <p className="ml-auto font-mono-code text-[9px] uppercase tracking-[0.12em] text-ink-soft">
          {state === "offline"
            ? "api offline"
            : state === "snapshot"
              ? `${fallbackSource === "live" ? "local reef" : "snapshot"}${fallbackAt ? ` · ${fallbackAt.slice(0, 10)}` : ""}`
              : all.length === 0
                ? "not fed yet"
                : `${all.length} zone${all.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* canvas — the plate shows through here and nowhere else */}
      <div className="relative">
        {/* The plate inside the panel keeps the same cover fit — the panel is
            also landscape, and cropping the corners is fine here because the
            cards sit over the middle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/engravings/dapp-reef-field.png')] bg-cover bg-center bg-no-repeat opacity-[0.20]"
        />

        <div className="relative min-h-[240px] px-4 py-5 sm:min-h-[300px] sm:px-8 sm:py-8">
          {state === "offline" && (
            <div className="flex min-h-[240px] flex-col items-center justify-center">
              <p className="max-w-[420px] text-center font-sans-clean text-[11.5px] leading-relaxed text-ink-muted">
                The reef map needs the local api on <code className="font-mono-code text-cobalt">127.0.0.1:7331</code>.
                Start it with <code className="font-mono-code text-cobalt">coral api</code>, then reload.
              </p>
            </div>
          )}

          {(state === "online" || state === "snapshot") && shown.length === 0 && (
            /* A zone needs a polyp, and a polyp needs a decision. The empty map
               shows the shape a zone will take, without claiming one exists —
               hence no "zone 0" label, which read as a contradiction against
               the header's own count. */
            <div className="flex min-h-[240px] flex-col items-center justify-center">
              <svg viewBox="0 0 100 60" className="w-full max-w-[420px]" aria-hidden>
                {/* ghost lattice: the same slots, at rest */}
                {EDGES.slice(0, 4).map(([a, b]) => {
                  const from = SLOTS[a]!;
                  const to = SLOTS[b]!;
                  return (
                    <line
                      key={`${a}-${b}`}
                      x1={from.x}
                      y1={from.y * 0.6}
                      x2={to.x}
                      y2={to.y * 0.6}
                      stroke="#c5cdf5"
                      strokeWidth="0.3"
                      strokeDasharray="1.4 1.8"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                {SLOTS.slice(0, 4).map((s, i) => (
                  <rect
                    key={i}
                    x={s.x - 9}
                    y={s.y * 0.6 - 4}
                    width="18"
                    height="8"
                    fill="none"
                    stroke="#c5cdf5"
                    strokeWidth="0.3"
                    strokeDasharray="1.4 1.8"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              <p className="mt-4 max-w-[360px] text-center font-serif-editorial text-[14px] italic leading-snug text-ink-muted">
                The reef has not been fed yet.
              </p>
              <p className="mt-1.5 max-w-[360px] text-center font-sans-clean text-[11px] leading-relaxed text-ink-soft">
                Each scan writes one polyp. A zone forms once it has enough to be judged.
              </p>
              <a
                href="#scan"
                className="mt-4 border border-rule-cobalt px-4 py-2 font-sans-clean text-[10px] font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-cobalt hover:bg-cobalt hover:text-white"
              >
                run the first scan ↓
              </a>
            </div>
          )}

          {shown.length > 0 && (
            <>
              {/* Phones: the percent slots collide once three cards share the
                  width, so small screens get a plain grid instead of the map. */}
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                {shown.map((z) => {
                  const strength = Math.max(0, Math.min(1, z.strength));
                  const isSel = selected === z.name;
                  return (
                    <ZoneCard
                      key={z.name}
                      zone={z}
                      strength={strength}
                      selected={isSel}
                      onSelect={() => setSelected(isSel ? null : z.name)}
                    />
                  );
                })}
              </div>

              <div className="relative mx-auto hidden max-w-[880px] sm:block" style={{ aspectRatio: "16 / 9" }}>
                {/* connectors */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full"
                  aria-hidden
                >
                  {EDGES.map(([a, b]) => {
                    const from = SLOTS[a];
                    const to = SLOTS[b];
                    if (!from || !to) return null;
                    const active = selected === shown[a]?.name || selected === shown[b]?.name;
                    return (
                      <line
                        key={`${a}-${b}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={active ? "#1e32ca" : "#aeb9ea"}
                        strokeWidth={active ? 1.4 : 1}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </svg>

                {/* zone cards, positioned on their slot */}
                {shown.map((z, i) => {
                  const slot = SLOTS[i]!;
                  const isSel = selected === z.name;
                  return (
                    <div
                      key={z.name}
                      className="absolute w-[30%] max-w-[236px] -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    >
                      <ZoneCard
                        zone={z}
                        strength={Math.max(0, Math.min(1, z.strength))}
                        selected={isSel}
                        onSelect={() => setSelected(isSel ? null : z.name)}
                      />
                    </div>
                  );
                })}

                {overflow > 0 && (
                  <p className="absolute -bottom-2 left-1/2 -translate-x-1/2 font-mono-code text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                    +{overflow} more zone{overflow === 1 ? "" : "s"} not shown
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* detail strip — the selected zone's evidence */}
      <div className="border-t border-rule bg-white px-5 py-3.5">
        {pick ? (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
            <p className="font-mono-code text-[9px] uppercase tracking-[0.16em] text-cobalt">selected</p>
            <p className="font-serif-editorial text-[15px] text-ink">{pick.name}</p>
            <p className="font-mono-code text-[10px] text-ink-muted">
              {pick.polyps} polyps · {pick.wins}w/{pick.losses}l · edge{" "}
              <span className="text-cobalt">{pick.strength.toFixed(2)}</span>
            </p>
            <p className="font-mono-code text-[10px] text-ink-soft">last seen {since(pick.lastSeen)}</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-auto font-mono-code text-[9px] uppercase tracking-[0.12em] text-ink-soft underline underline-offset-4 hover:text-cobalt"
            >
              clear
            </button>
          </div>
        ) : (
          <p className="font-sans-clean text-[10.5px] text-ink-soft">
            Select a zone to see the evidence behind it. Zones with a high edge are weighted heavier when the
            agent reasons.
          </p>
        )}
      </div>
    </section>
  );
}
