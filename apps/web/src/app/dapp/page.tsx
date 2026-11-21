import type { Metadata } from "next";
import { Footer, Header } from "@/components/chrome";
import { PageBackdrop, PageHero } from "@/components/page-hero";
import { readReef } from "@/lib/reef";
import { DappClient } from "./dapp-client";
import { ReefMap } from "./reef-map";

export const metadata: Metadata = {
  title: "dApp",
  description:
    "The interactive surface of this machine's reef — Chainbridge wallet, on-chain scans, gated quotes and swaps. Talks to coral api on 127.0.0.1 only.",
};

export default async function DappPage() {
  const reef = await readReef();
  return (
    <>
      <Header />
      <main className="relative">
        <PageBackdrop />
        <div className="relative z-10">
          <PageHero
            eyebrow="The dApp"
            title={
              <>
                The reef,
                <br />
                driven
              </>
            }
          >
            Every number below comes from the local API the CLI serves on 127.0.0.1 — the same engine, the same risk
            gate, the same SQLite reef. This page never signs; the wallet never leaves your machine.
          </PageHero>

          <div className="mx-auto max-w-[1220px] px-6 py-10 sm:px-10">
            <ReefMap
              fallbackZones={reef.zones}
              fallbackSource={reef.source === "none" ? null : reef.source}
              fallbackAt={reef.publishedAt}
            />
            <DappClient />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
