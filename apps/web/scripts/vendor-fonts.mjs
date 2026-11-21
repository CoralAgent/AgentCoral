/**
 * Download the woff2 files Google Fonts would serve, so the build never
 * needs the network again. Run once from apps/web: node scripts/vendor-fonts.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../src/fonts");
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FAMILIES = [
  { slug: "inter", css2: "Inter:wght@400;500;600", weights: ["400", "500", "600"], styles: ["normal"] },
  {
    slug: "cormorant",
    css2: "Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600",
    weights: ["300", "400", "500", "600"],
    styles: ["normal", "italic"],
  },
  { slug: "garamond", css2: "EB+Garamond:ital,wght@0,400;0,500;1,400;1,500", weights: ["400", "500"], styles: ["normal", "italic"] },
  { slug: "jetbrains", css2: "JetBrains+Mono:wght@400;500", weights: ["400", "500"], styles: ["normal"] },
];

const cssUrl = (f) => `https://fonts.googleapis.com/css2?family=${f.css2}&display=swap`;

async function fetchRetry(url, headers, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

for (const fam of FAMILIES) {
  const res = await fetchRetry(cssUrl(fam), { "user-agent": UA });
  const css = await res.text();

  // @font-face blocks; keep only the latin subset (unicode-range starts U+0000-00FF).
  const blocks = css.split("@font-face").slice(1);
  const latin = blocks.filter((b) => /unicode-range:\s*U\+0000-00FF/.test(b));
  const seen = new Set();
  for (const block of latin) {
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? "normal";
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const url = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
    if (!family || !weight || !url)
      throw new Error(`unparsable block in ${fam.slug}: ${JSON.stringify(block.slice(0, 200))}`);
    const key = `${style}-${weight}`;
    if (seen.has(key)) continue; // css2 repeats latin blocks per axis; first wins
    seen.add(key);
    const file = `${fam.slug}-${weight}${style === "italic" ? "i" : "n"}.woff2`;
    const bin = await (await fetchRetry(url, { "user-agent": UA })).arrayBuffer();
    writeFileSync(resolve(OUT, file), Buffer.from(bin));
    console.log(`${file} ${(bin.byteLength / 1024).toFixed(0)}KB`);
  }
}
console.log("done →", OUT);
