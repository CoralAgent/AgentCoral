# Deploying CORAL to Railway

`.railway/railway.ts` is the project definition Railway actually applies.
`railway.json` still records the same build and start commands, but a service
created now cannot opt into that older file. The build below is the one that
was verified on a fresh clone (see "What was verified" below).

## 1. What gets deployed

Only `apps/web`. The packages under `packages/` are local tools: `@coral/core`
writes a SQLite file on your machine, and `@coral/cli` is a terminal binary.
Neither has anything to serve, and neither is built in this pipeline.

That is also why the web app imports no workspace package: it reads the reef
file with Node's built-in `node:sqlite`, in read-only mode. One app, one
dependency tree, no native modules, no Rust toolchain.

## 2. Create the service

Railway needs the repo on GitHub first. It already is:
<https://github.com/CoralAgent/AgentCoral>

```bash
railway login
railway init --name coral --workspace "noushingenno-spec's Projects"
railway config apply --yes
railway domain --service coral
```

`railway config apply` creates the `coral` service from `CoralAgent/AgentCoral` on
`main` and sets the build, start, and healthcheck. A push to `main` redeploys
that service. Do not also run `railway up`.

## 3. What `railway.json` does

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @coral/web build"
  },
  "deploy": {
    "startCommand": "pnpm --filter @coral/web start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

`corepack enable` is what gives the builder the pnpm version pinned in
`package.json` (`packageManager: pnpm@10.33.0`). Without it the image may ship
a pnpm that misreads the lockfile.

`next start` reads `PORT` from the environment by itself and is bound to
`0.0.0.0` in the `start` script. Do not pass `-p $PORT`: Railway injects
`PORT`, and the flag is both redundant and hostile to shell expansion.

## 4. Environment variables

None are required. The site is static copy plus one read-only dashboard route,
and it defaults to paper mode. Optional, if you want the dashboard to read a
reef other than `./.coral`:

| Variable | Default | Meaning |
|---|---|---|
| `CORAL_HOME` | `../../.coral` | Directory holding `reef.db` |
| `CORAL_MODE` | `paper` | Only affects the mode label the dashboard shows |

On Railway there is no `reef.db`, so `/reef` renders its honest empty state and
tells you the three commands that fill it. That is the intended behaviour, not
a bug: the reef is local state that belongs to whoever ran the agent.

## 5. Interactive surfaces stay local

The deployed site is marketing plus a read-only reef view — by design. The
agent's real surface (Chainbridge wallet, gated swaps, `coral api`) only ever binds to
`127.0.0.1` on the machine running the CLI, because custody and the risk gate
live in that process. Do not proxy `coral api` to the public site.

## 5a. Publishing a reef snapshot to the public site

`/reef` resolves data in this order: `CORAL_HOME` → local `.coral` reefs → a
bundled snapshot. Railway has none of the first three, so it serves whatever
`apps/web/reef-snapshot/` contains. To update it:

```bash
coral publish          # snapshot reef.db + token-series into apps/web/reef-snapshot
coral publish --git    # the same, then commit + push (triggers the redeploy)
```

`VACUUM INTO` produces a consistent copy — safe to run while `coral api` holds
the live reef. The page labels itself "published snapshot" with the export
timestamp; visitors see a frozen copy, never your live file.

**This makes your trading history public.** Positions, theses, P&L — all of it.
Publish only when that is the point (a proof-of-work reef), not as routine.

On `/dapp`, the visitor wallet (Privy embedded) works without any backend —
the agent sections gracefully collapse into a "public view" panel when the
local api is unreachable.

## 6. Docker (local only)

`Dockerfile.web`, `Dockerfile.agent` and `docker-compose.yml` run the same
stack on a developer's machine — they are not the Railway path.

```bash
docker compose up --build
# api → http://127.0.0.1:7331  (CORAL_API_TOKEN=coral-local, required for the
#                               non-loopback in-container bind)
# web → http://127.0.0.1:3000  (/reef reads the shared reef volume read-only)
```

Hard constraints, verified while building this:

- `better-sqlite3` needs a toolchain fallback — `Dockerfile.agent` installs
  python3/make/g++ in the build stage.
- Chainbridge keeps its key in the OS keychain. That does not exist inside a
  container: a wallet made on macOS cannot be read there. Create or import a
  wallet inside the container (`oak call oak_setup ...`) and treat it as a
  separate local identity. Never ship a funded wallet inside an image.
- `coral api` refuses `--host 0.0.0.0` without `CORAL_API_TOKEN`; the compose
  file sets a placeholder token. Change it for anything real.
- Both ports publish to `127.0.0.1` on the host. Publishing them wider is a
  custody decision, not a config tweak.

## 7. Redeploys

Once the GitHub source is connected, `git push` **is** the deploy. Nothing else
needed.

Do not also run `railway up`: it uploads the working directory rather than the
commit, and when a live GitHub connection exists the two deploys race and the
older one can win.

## What was verified

On a fresh clone of `CoralAgent/AgentCoral`, not the working copy:

```
corepack enable && pnpm install --frozen-lockfile        → done in 17.4s
pnpm --filter @coral/web build                            → 7/7 routes
PORT=8123 pnpm --filter @coral/web start                  → listening on 0.0.0.0:8123
```

Every route answered 200 (`/`, `/install`, `/how-it-works`, `/safety`, `/reef`)
and the hero plate served as `image/webp`, 333,852 bytes, VP8-encoded 1600px.

Not verified: an actual Railway deployment. The CLI is authenticated but the
account's trial has expired, so project creation is refused with "Your trial
has expired. Please select a plan to continue using Railway." Activate a plan,
then run the two commands in section 2. The configuration itself needs no
change.

## Pitfalls

- `output: "standalone"` is deliberately **not** set. Its trace step copies
  symlinks, which fails on Windows without developer mode, and `next start`
  serves the built app from `.next` with nothing lost.
- The plates are pre-optimised WebP (1.2 MB total, down from 17 MB of PNG) and
  served as-is, so `images.unoptimized` is on. Re-enabling the Next image
  optimiser would re-encode them at request time for no benefit.
- `railway.json` is Config as Code, which Railway has marked deprecated in
  favour of `.railway/railway.ts` (existing files keep working until
  2026-12-01). It is kept because it is the format that was actually tested;
  migrate with `railway config migrate --apply` when you want the new shape.
