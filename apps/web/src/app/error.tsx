"use client";

/**
 * Runtime error boundary. Any unexpected failure renders this instead of a
 * raw crash page — the site stays on-brand even when something breaks.
 */
import { Header, Footer } from "@/components/chrome";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <Header />
      <main className="relative flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-[520px] border border-rule bg-white px-8 py-10">
          <p className="font-mono-code text-[10px] uppercase tracking-[0.12em] text-ink-soft">Unexpected condition</p>
          <h1 className="mt-3 font-serif-display text-[26px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
            The page hit
            <br />
            something unreef
          </h1>
          <p className="mt-4 font-sans-clean text-[12px] leading-[1.6] text-ink-soft">
            This is a rendering error, not a data claim — the reef itself is untouched. It will still be there when
            this page recovers.
          </p>
          <button
            onClick={reset}
            className="mt-6 border border-cobalt px-5 py-2.5 font-mono-code text-[10.5px] uppercase tracking-[0.12em] text-cobalt hover:bg-[#F8F9FE]"
          >
            Try again
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}
