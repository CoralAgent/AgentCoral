/**
 * Snapshot publishing — shared by `coral publish` and the daemon.
 *
 * The snapshot is the only channel between the private reef and the public
 * site: reef.db gets VACUUM INTO'd into apps/web/reef-snapshot, where the
 * deployed web app reads it as its fallback reef. Publishing is always a
 * deliberate act — it makes trading history public.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Runtime } from "./runtime.js";

export interface PublishResult {
  snapDir: string;
  dbKb: number;
  polyps: number;
  generation: number;
  tokenSeries: boolean;
  pushed: boolean;
}

/** Walk up from cwd until we find the monorepo root (apps/web exists). */
export function findRepoRoot(): string | null {
  let root = process.cwd();
  for (let i = 0; i < 5 && !existsSync(join(root, "apps", "web", "package.json")); i++) {
    root = join(root, "..");
  }
  return existsSync(join(root, "apps", "web", "package.json")) ? root : null;
}

/**
 * Write a fresh snapshot of the reef into apps/web/reef-snapshot.
 * `git: true` also commits and pushes it, which triggers a site redeploy.
 */
export function publishSnapshot(rt: Runtime, opts: { git?: boolean; quiet?: boolean } = {}): PublishResult {
  const root = findRepoRoot();
  if (!root) throw new Error("cannot find apps/web — run from inside the CORAL repo");

  const snapDir = join(root, "apps", "web", "reef-snapshot");
  mkdirSync(snapDir, { recursive: true });

  const dbIn = join(rt.config.home, "reef.db");
  if (!existsSync(dbIn)) throw new Error(`no reef at ${dbIn} — run coral init first`);

  // VACUUM INTO gives a consistent, compacted copy even with WAL journals —
  // but it refuses to overwrite, so the previous snapshot goes first.
  const dbOut = join(snapDir, "reef.db");
  if (existsSync(dbOut)) rmSync(dbOut);
  const src = new DatabaseSync(dbIn);
  src.exec(`VACUUM INTO '${dbOut.replace(/'/g, "''")}'`);
  src.close();

  const seriesIn = join(rt.config.home, "token-series.json");
  if (existsSync(seriesIn)) copyFileSync(seriesIn, join(snapDir, "token-series.json"));

  const snap = rt.memory.snapshot();
  writeFileSync(
    join(snapDir, "published.json"),
    JSON.stringify(
      {
        publishedAt: new Date().toISOString(),
        polyps: snap.polyps,
        generation: snap.generation,
        mode: rt.config.mode,
      },
      null,
      2,
    ),
  );

  let pushed = false;
  if (opts.git) {
    execFileSync("git", ["add", "apps/web/reef-snapshot"], { cwd: root, stdio: "ignore" });
    try {
      execFileSync("git", ["commit", "-m", "Publish a reef snapshot for the public site"], {
        cwd: root,
        stdio: "ignore",
      });
      execFileSync("git", ["push"], { cwd: root, stdio: "ignore" });
      pushed = true;
    } catch {
      // commit fails when the snapshot is unchanged — not an error for the
      // daemon, which publishes on every pass.
    }
  }

  return {
    snapDir,
    dbKb: statSync(dbOut).size / 1024,
    polyps: snap.polyps,
    generation: snap.generation,
    tokenSeries: existsSync(seriesIn),
    pushed,
  };
}
