import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveCoralHome } from "./reef";

/**
 * The evidence page's numbers, computed from the published snapshot.
 *
 * Same rules as readReef(): read-only, fail-safe, never throws. Pending
 * polyps never count toward hit rate; neutral (holds) settle out of the
 * hit rate too — a hold that settles neutral is not a free win. Zones
 * with fewer than three decided polyps render as "untested" rather than
 * a percentage, because three lucky wins must never read as a 100% edge.
 */

export interface EvidenceZone {
  name: string;
  decided: number;
  wins: number;
  losses: number;
  /** Laplace-smoothed (wins + 1) / (decided + 2); null when untested. */
  edge: number | null;
}

export interface EvidenceSymbol {
  symbol: string;
  decided: number;
  wins: number;
  losses: number;
  realised: number;
}

export interface EvidenceBucket {
  label: string;
  decided: number;
  wins: number;
}

export interface EvidenceData {
  available: boolean;
  /** "snapshot" = the published bundle committed to the repo; "live" = an operator reef. */
  source: "live" | "snapshot" | "none";
  publishedAt: string | null;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  neutrals: number;
  /** wins / (wins + losses); null when nothing has decided. */
  hitRate: number | null;
  realised: number;
  /** Largest peak-to-trough decline on the cumulative-pnl curve; null if the curve never declines. */
  maxDrawdown: number | null;
  /** Number of points on the equity curve (settled polyps with a non-null pnl, in time order). */
  curvePoints: number;
  zones: EvidenceZone[];
  symbols: EvidenceSymbol[];
  calibration: EvidenceBucket[];
  error?: string;
}

const ZONE_EXCLUDED = new Set(["sanctioned", "gated", "reflection", "settlement"]);

export function readEvidence(): EvidenceData {
  const { home, source } = resolveCoralHome();
  const dbPath = join(home, "reef.db");

  let publishedAt: string | null = null;
  if (source === "snapshot") {
    try {
      const meta = JSON.parse(readFileSync(join(home, "published.json"), "utf8")) as { publishedAt?: string };
      publishedAt = meta.publishedAt ?? null;
    } catch {
      /* no meta — show snapshot without a timestamp */
    }
  }

  const empty: EvidenceData = {
    available: false,
    source,
    publishedAt,
    settled: 0,
    pending: 0,
    wins: 0,
    losses: 0,
    neutrals: 0,
    hitRate: null,
    realised: 0,
    maxDrawdown: null,
    curvePoints: 0,
    zones: [],
    symbols: [],
    calibration: [],
  };

  if (!existsSync(dbPath)) return empty;

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });

    const counts = db
      .prepare(
        `SELECT COALESCE(SUM(outcome = 'win'), 0)     AS wins,
                COALESCE(SUM(outcome = 'loss'), 0)    AS losses,
                COALESCE(SUM(outcome = 'neutral'), 0) AS neutrals,
                COALESCE(SUM(outcome = 'pending'), 0) AS pending,
                COALESCE(SUM(CASE WHEN outcome IN ('win','loss','neutral') THEN pnl ELSE 0 END), 0) AS realised
         FROM polyps`,
      )
      .get() as { wins: number; losses: number; neutrals: number; pending: number; realised: number };

    // Equity curve: settled polyps in time order, cumulative pnl.
    const curveRows = db
      .prepare(
        `SELECT pnl FROM polyps
         WHERE outcome IN ('win','loss','neutral') AND pnl IS NOT NULL
         ORDER BY created_at ASC`,
      )
      .all() as { pnl: number }[];

    let maxDrawdown: number | null = null;
    let peak = 0;
    let cum = 0;
    for (const row of curveRows) {
      cum += Number(row.pnl);
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > 0 && (maxDrawdown === null || dd > maxDrawdown)) maxDrawdown = dd;
    }

    // Edge per zone: same tag grouping as readReef(), Laplace-smoothed.
    const tagRows = db
      .prepare(
        `SELECT tags, outcome FROM polyps
         WHERE kind IN ('decision','trade','reflection') AND outcome IN ('win','loss','neutral')`,
      )
      .all() as { tags: string; outcome: string }[];

    const zoneMap = new Map<string, { wins: number; losses: number }>();
    for (const row of tagRows) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags) as string[];
      } catch {
        continue;
      }
      for (const tag of tags) {
        if (ZONE_EXCLUDED.has(tag)) continue;
        const z = zoneMap.get(tag) ?? { wins: 0, losses: 0 };
        if (row.outcome === "win") z.wins++;
        if (row.outcome === "loss") z.losses++;
        zoneMap.set(tag, z);
      }
    }
    const zones: EvidenceZone[] = [...zoneMap.entries()]
      .map(([name, z]) => {
        const decided = z.wins + z.losses;
        return {
          name,
          decided,
          wins: z.wins,
          losses: z.losses,
          edge: decided === 0 ? null : (z.wins + 1) / (decided + 2),
        };
      })
      .sort((a, b) => b.decided - a.decided || a.name.localeCompare(b.name));

    // Per symbol.
    const symRows = db
      .prepare(
        `SELECT symbol,
                COALESCE(SUM(outcome = 'win'), 0)  AS wins,
                COALESCE(SUM(outcome = 'loss'), 0) AS losses,
                COALESCE(SUM(pnl), 0)              AS realised
         FROM polyps
         WHERE outcome IN ('win','loss','neutral') AND symbol IS NOT NULL
         GROUP BY symbol ORDER BY realised DESC`,
      )
      .all() as { symbol: string; wins: number; losses: number; realised: number }[];
    const symbols: EvidenceSymbol[] = symRows.map((r) => ({
      symbol: String(r.symbol),
      decided: Number(r.wins) + Number(r.losses),
      wins: Number(r.wins),
      losses: Number(r.losses),
      realised: Number(r.realised),
    }));

    // Confidence calibration: does higher confidence actually win more?
    const calRows = db
      .prepare(
        `SELECT CASE
                  WHEN confidence < 0.5 THEN 'a'
                  WHEN confidence <= 0.7 THEN 'b'
                  ELSE 'c'
                END AS bucket,
                COALESCE(SUM(outcome = 'win'), 0)  AS wins,
                COALESCE(SUM(outcome = 'loss'), 0) AS losses
         FROM polyps
         WHERE outcome IN ('win','loss') AND confidence IS NOT NULL
         GROUP BY bucket`,
      )
      .all() as { bucket: string; wins: number; losses: number }[];
    const labels: Record<string, string> = { a: "confidence < 0.50", b: "0.50 – 0.70", c: "> 0.70" };
    const calibration: EvidenceBucket[] = ["a", "b", "c"].map((k) => {
      const row = calRows.find((r) => r.bucket === k);
      return {
        label: labels[k]!,
        decided: row ? Number(row.wins) + Number(row.losses) : 0,
        wins: row ? Number(row.wins) : 0,
      };
    });

    const decided = counts.wins + counts.losses;
    return {
      ...empty,
      available: true,
      publishedAt,
      settled: counts.wins + counts.losses + counts.neutrals,
      pending: counts.pending,
      wins: counts.wins,
      losses: counts.losses,
      neutrals: counts.neutrals,
      hitRate: decided === 0 ? null : counts.wins / decided,
      realised: counts.realised,
      maxDrawdown,
      curvePoints: curveRows.length,
      zones,
      symbols,
      calibration,
    };
  } catch (err) {
    return { ...empty, error: (err as Error).message };
  } finally {
    db?.close();
  }
}
