import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The reef dashboard reads a local SQLite file through Node's built-in
  // node:sqlite, so this app has no native dependency and imports no workspace
  // package. That makes it a plain Node service: no edge runtime, no serverless
  // target, no bundler extension hacks.
  // Deliberately NOT `output: "standalone"` — its trace step copies symlinks,
  // which fails on Windows without developer mode, and `next start` runs the
  // built app fine from .next with nothing lost.
  //
  // Pin the trace root to this monorepo. Without it Next walks up, finds
  // D:\GENNO LABS\coral\pnpm-lock.yaml (the older checkout) and treats THAT as
  // the workspace root, so file tracing and the dev watcher can reach outside
  // this repo into an unrelated project.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  images: {
    // Plates are pre-optimised WebP, served as-is.
    unoptimized: true,
  },
};

export default nextConfig;
