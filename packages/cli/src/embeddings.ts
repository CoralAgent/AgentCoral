/**
 * Semantic recall wiring. Gemini's free-tier embedding endpoint, called
 * directly — no SDK dependency for one POST. Any failure returns null and
 * the reef falls back to keyword scoring, the same degrade pattern as the
 * LLM reasoner.
 */
import type { CoralMemory, Embedder } from "@coral/core";

const MODEL = "gemini-embedding-001";

/** Embed texts via Gemini batchEmbedContents. Null on missing key or any error. */
export const geminiEmbedder: Embedder = async (texts) => {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key || texts.length === 0) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { embeddings?: { values?: number[] }[] };
    const vectors = json.embeddings?.map((e) => e.values ?? []);
    return vectors && vectors.length === texts.length && vectors.every((v) => v.length > 0) ? vectors : null;
  } catch {
    return null;
  }
};

/**
 * Embed theses for polyps that predate semantic recall or were written by
 * paths that don't embed inline. Bounded per call so a daemon pass stays
 * cheap; returns how many were embedded.
 */
export async function backfillEmbeddings(memory: CoralMemory, embedder: Embedder, limit = 20): Promise<number> {
  const missing = memory.unembedded(limit);
  if (missing.length === 0) return 0;
  const vectors = await embedder(missing.map((p) => p.thesis));
  if (!vectors) return 0;
  let stored = 0;
  for (const [i, polyp] of missing.entries()) {
    const vec = vectors[i];
    if (vec?.length) {
      memory.setEmbedding(polyp.id, vec);
      stored++;
    }
  }
  return stored;
}
