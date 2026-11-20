"use client";

import { useState } from "react";

/**
 * The contract address, as a copyable plate.
 *
 * Reads NEXT_PUBLIC_CORAL_CA. Until the token launches it renders a dash, so
 * the hero keeps its finished layout without inventing an address: printing a
 * plausible-looking placeholder is how people send funds to the wrong contract.
 */
export function CaBadge({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const hasAddress = /^0x[0-9a-fA-F]{40}$/.test(address);

  async function copy() {
    if (!hasAddress) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context, permission). Select the text
      // instead so it can still be copied by hand.
      const range = document.createRange();
      const node = document.getElementById("coral-ca");
      if (node) {
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <div className="mt-6 inline-flex max-w-full items-stretch border border-cobalt/35 bg-white/70 backdrop-blur-[2px]">
      <span className="flex items-center border-r border-cobalt/25 px-2.5 font-mono-code text-[9px] uppercase tracking-[0.16em] text-cobalt/70">
        CA
      </span>

      <span
        id="coral-ca"
        className="flex min-w-[7rem] items-center px-3 font-mono-code text-[10.5px] leading-none text-cobalt sm:min-w-0 sm:text-[11.5px]"
      >
        {hasAddress ? (
          <>
            {/* full address on wide screens, truncated on phones */}
            <span className="hidden sm:inline">{address}</span>
            <span className="sm:hidden">
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          </>
        ) : (
          <span className="tracking-[0.3em] text-cobalt/45">—</span>
        )}
      </span>

      {hasAddress && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copy contract address"
          className="flex items-center gap-1.5 border-l border-cobalt/25 px-2.5 font-mono-code text-[9px] uppercase tracking-[0.14em] text-cobalt/70 transition-colors hover:bg-cobalt hover:text-white"
        >
          {copied ? "copied" : "copy"}
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      )}
    </div>
  );
}
