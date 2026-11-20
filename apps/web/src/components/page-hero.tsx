import type { ReactNode } from "react";
import { MonogramSeal } from "./engraving";

/**
 * The reef plate behind a page, held far back.
 *
 * `cover` because the plate is landscape (1376x768): on a wide viewport it
 * fills without side bands. Fixed so it does not slide against the panels
 * while reading.
 */
export function PageBackdrop({ opacity = 0.18 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 bg-[url('/engravings/dapp-reef-field.png')] bg-cover bg-center bg-no-repeat"
      style={{ opacity }}
    />
  );
}

/**
 * The top of every interior page.
 *
 * Centred on purpose: the plate's own composition is an empty field in the
 * middle of the frame, so a centred lockup sits in the gap instead of fighting
 * the coral in the lower-left.
 */
export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative border-b border-rule/70">
      <div className="mx-auto max-w-[1220px] px-6 py-16 text-center sm:px-10 sm:py-20">
        <div className="flex justify-center">
          <MonogramSeal variant="cobalt" className="h-9 w-9" />
        </div>

        <p className="mt-5 font-mono-code text-[10px] uppercase tracking-[0.18em] text-cobalt">{eyebrow}</p>

        <h1 className="mx-auto mt-5 max-w-[900px] font-serif-display text-[36px] font-normal uppercase leading-[0.94] tracking-[-0.015em] text-ink sm:text-[54px] md:text-[62px]">
          {title}
        </h1>

        {children && (
          <div className="mx-auto mt-6 max-w-[560px] font-serif-editorial text-[15px] italic leading-[1.4] text-ink/80">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
