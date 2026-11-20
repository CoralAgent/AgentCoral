"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MonogramSeal } from "./engraving";

/**
 * Sign-in surface for the header.
 *
 * This is the interface only. No auth provider is wired in this build, so each
 * option resolves to an explicit "not live yet" state rather than pretending to
 * log someone in. A button that fakes success is worse than one that says it is
 * not ready: the first makes people think they have a wallet, the second tells
 * them the truth in one line.
 *
 * When Privy is wired later, replace the `setPicked` call in `choose()` with
 * `login()` from @privy-io/react-auth — the options and the network badge
 * already match that provider's shape.
 *
 * The panel is portalled to <body>. The header it lives in carries
 * `backdrop-blur`, and a filter on an ancestor makes `position: fixed` resolve
 * against that ancestor instead of the viewport — which clipped this panel to
 * the header's height. Rendering into body sidesteps that whole class of bug.
 */
const OPTIONS = [
  {
    id: "google",
    label: "Continue with Google",
    hint: "Email or Google account",
    icon: (
      <svg viewBox="0 0 18 18" className="h-[15px] w-[15px]" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
    ),
  },
  {
    id: "email",
    label: "Continue with email",
    hint: "One-time code, no password",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" className="h-[15px] w-[15px] text-cobalt" aria-hidden>
        <rect x="1.5" y="3.75" width="15" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2 5l7 4.5L16 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "wallet",
    label: "Connect wallet",
    hint: "Robinhood Chain · 4663",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" className="h-[15px] w-[15px] text-cobalt" aria-hidden>
        <path d="M2.25 5.25h13.5v8.25a1.5 1.5 0 0 1-1.5 1.5h-10.5a1.5 1.5 0 0 1-1.5-1.5V5.25z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2.25 5.25L12 2.25v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12.4" cy="9.75" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
] as const;

export function SignIn({ label = "Sign in" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // A portal needs a DOM target, which does not exist during the server render.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function close() {
    setOpen(false);
    setPicked(null);
  }

  /** Interface only: no provider is connected, so say so instead of faking a session. */
  function choose(id: string) {
    setPicked(id);
  }

  const panel = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to CORAL"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="fixed inset-0 cursor-default bg-[#04070f]/55 backdrop-blur-[3px]"
      />

          <div className="relative w-full max-w-[400px] border border-rule-cobalt bg-white shadow-[0_24px_80px_-24px_rgba(10,20,60,.45)]">
            <div className="flex items-start justify-between border-b border-rule px-6 pb-4 pt-6">
              <div>
                <MonogramSeal variant="cobalt" className="h-9 w-9" />
                <h2 className="mt-4 font-serif-display text-[26px] font-normal uppercase leading-[1] tracking-[-0.01em] text-ink">
                  Sign in
                </h2>
                <p className="mt-2 max-w-[280px] font-serif-editorial text-[13px] italic leading-snug text-ink-muted">
                  One reef, one identity. Your wallet stays yours.
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 -mt-1 p-1.5 text-ink-soft transition-colors hover:text-cobalt"
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5">
              {OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => choose(o.id)}
                  aria-pressed={picked === o.id}
                  className={`mb-2 flex w-full items-center gap-3 border px-3.5 py-3 text-left transition-colors last:mb-0 hover:border-cobalt/45 hover:bg-[#f8f9fe] ${
                    picked === o.id ? "border-cobalt/45 bg-[#f8f9fe]" : "border-rule"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-rule bg-white">
                    {o.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-sans-clean text-[12px] font-medium text-ink">{o.label}</span>
                    <span className="block font-mono-code text-[9.5px] uppercase tracking-[0.1em] text-ink-soft">
                      {o.hint}
                    </span>
                  </span>
                </button>
              ))}

              {picked && (
                <p
                  role="status"
                  className="mt-3 border-l-2 border-cobalt/40 bg-[#f8f9fe] px-3 py-2 font-sans-clean text-[10.5px] leading-relaxed text-ink-muted"
                >
                  Interface only in this build: no auth provider is connected yet, so nothing is signed. The
                  provider lands with the launch.
                </p>
              )}

              <div className="mt-5 flex items-center gap-2.5 border-t border-rule pt-4">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cobalt" aria-hidden />
                <p className="font-mono-code text-[9px] uppercase leading-relaxed tracking-[0.12em] text-ink-soft">
                  Settles on Robinhood Chain · id 4663
                </p>
              </div>

              <p className="mt-3 font-sans-clean text-[9.5px] leading-relaxed text-ink-soft">
                CORAL never holds your key. Signing happens in your wallet, on your machine.
              </p>
            </div>
          </div>
      </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-rule-cobalt px-4 py-1 font-sans-clean text-[10.5px] font-medium tracking-[0.01em] text-ink transition-colors hover:border-cobalt hover:bg-cobalt hover:text-white"
      >
        {label}
      </button>

      {open && mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
