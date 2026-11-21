"use client";

/**
 * Visitor wallet — Privy embedded wallets on Robinhood Chain.
 *
 * This is the public side of the dApp: a visitor logs in, Privy gives them an
 * embedded EOA, and they sign their own transactions in their own browser.
 * CORAL never sees a key — the wallet belongs to the visitor, just as the
 * agent's Chainbridge wallet belongs to the operator.
 *
 * Scope is deliberately honest: balances and sends work today (plain
 * eth_sendTransaction calldata we can build safely). Visitor swaps are not
 * offered — Chainbridge's swap tool prepares only for its own wallet, and building
 * Uniswap calldata without a verified ABI is how people burn money.
 *
 * Needs NEXT_PUBLIC_PRIVY_APP_ID (dashboard.privy.io) and embedded wallets
 * enabled on the app. Without it this renders a setup note, not a broken page.
 */
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  parseUnits,
  encodeFunctionData,
  type Address,
} from "viem";
import { CORAL_ADDRESS, robinhoodChain, USDG_ADDRESS } from "@/lib/robinhood-chain";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const CHAIN_HEX = `0x${robinhoodChain.id.toString(16)}`;

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const TOKENS = [
  { symbol: "ETH", address: null as Address | null, decimals: 18 },
  { symbol: "USDG", address: USDG_ADDRESS as Address, decimals: 6 },
  { symbol: "CORAL", address: CORAL_ADDRESS as Address, decimals: 18 },
];

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(robinhoodChain.rpcUrls.default.http[0]),
});

const mono = "font-mono-code";
const input =
  "w-full border border-rule bg-white px-3 py-2 font-mono-code text-[11px] text-ink placeholder:text-ink-soft focus:border-cobalt focus:outline-none";
const btn =
  "border border-rule-cobalt px-4 py-2 font-sans-clean text-[10px] font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-cobalt hover:bg-cobalt hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

interface Bal {
  symbol: string;
  raw: bigint;
  decimals: number;
}

function WalletPanel() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const [balances, setBalances] = useState<Bal[]>([]);
  const [sendTo, setSendTo] = useState("");
  const [sendToken, setSendToken] = useState("USDG");
  const [sendAmount, setSendAmount] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [sendMsg, setSendMsg] = useState("");

  const refreshBalances = async () => {
    if (!wallet?.address) return;
    const addr = wallet.address as Address;
    const out: Bal[] = [];
    try {
      const eth = await publicClient.getBalance({ address: addr });
      out.push({ symbol: "ETH", raw: eth, decimals: 18 });
      for (const t of TOKENS.slice(1)) {
        const raw = await publicClient.readContract({
          address: t.address!,
          abi: ERC20,
          functionName: "balanceOf",
          args: [addr],
        });
        out.push({ symbol: t.symbol, raw: raw as bigint, decimals: t.decimals });
      }
    } catch {
      /* rpc hiccup — show what we have */
    }
    setBalances(out);
  };

  useEffect(() => {
    if (authenticated && wallet?.address) void refreshBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, wallet?.address]);

  if (!ready) {
    return <p className={`${mono} text-[10.5px] text-ink-soft`}>privy initialising…</p>;
  }

  if (!authenticated) {
    return (
      <div className="border border-rule bg-white px-5 py-6">
        <p className="max-w-[440px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
          Log in and an embedded wallet is created for you on Robinhood Chain — keys managed by Privy, signed in
          your browser, never touching CORAL. Email, Google, or an existing wallet.
        </p>
        <button className={`${btn} mt-4`} onClick={() => login()}>
          log in / create wallet
        </button>
      </div>
    );
  }

  const send = async () => {
    if (!wallet || !isAddress(sendTo) || !sendAmount) return;
    setSendState("sending");
    setSendMsg("");
    try {
      await wallet.switchChain(robinhoodChain.id);
      const provider = await wallet.getEthereumProvider();
      const token = TOKENS.find((t) => t.symbol === sendToken)!;
      const params =
        token.address === null
          ? { from: wallet.address, to: sendTo as Address, value: `0x${parseUnits(sendAmount, 18).toString(16)}` }
          : {
              from: wallet.address,
              to: token.address,
              data: encodeFunctionData({
                abi: ERC20,
                functionName: "transfer",
                args: [sendTo as Address, parseUnits(sendAmount, token.decimals)],
              }),
            };
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [params],
      })) as string;
      setSendState("done");
      setSendMsg(`sent — tx ${hash}`);
      void refreshBalances();
    } catch (e) {
      setSendState("error");
      setSendMsg(e instanceof Error ? e.message.slice(0, 160) : String(e));
    }
  };

  return (
    <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
      <div className="bg-white px-5 py-5">
        <p className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>embedded wallet</p>
        <p className={`${mono} mt-2 break-all text-[12px] text-ink`}>{wallet?.address ?? "creating…"}</p>
        <p className={`${mono} mt-3 text-[10px] text-ink-soft`}>
          {user?.email?.address ?? user?.google?.email ?? "logged in"} · chain {robinhoodChain.id} · keys via privy
        </p>
        <button className={`${mono} mt-3 text-[9.5px] text-cobalt underline underline-offset-4 hover:text-ink`} onClick={() => logout()}>
          log out
        </button>
        <ul className="mt-4 space-y-1 border-t border-rule pt-3">
          {balances.map((b) => (
            <li key={b.symbol} className={`${mono} flex justify-between text-[10.5px] text-ink`}>
              <span>{b.symbol}</span>
              <span>{formatUnits(b.raw, b.decimals)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-white px-5 py-5">
        <p className={`${mono} text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>send</p>
        <form
          className="mt-3 space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex gap-2">
            <select className={`${input} w-28`} value={sendToken} onChange={(e) => setSendToken(e.target.value)}>
              {TOKENS.map((t) => (
                <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
              ))}
            </select>
            <input className={input} placeholder="amount" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
          </div>
          <input className={input} placeholder="to 0x…" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
          <button className={btn} disabled={sendState === "sending" || !isAddress(sendTo) || !sendAmount || !wallet}>
            {sendState === "sending" ? "signing…" : "sign + send"}
          </button>
          {sendMsg && (
            <p className={`${mono} break-all text-[9.5px] ${sendState === "error" ? "text-[#B3261E]" : "text-cobalt"}`}>
              {sendMsg}
            </p>
          )}
        </form>
        <p className="mt-4 border-t border-rule pt-3 font-sans-clean text-[10px] font-medium leading-[1.45] text-ink-soft">
          Swaps from visitor wallets are not offered yet — the agent&apos;s Chainbridge tools prepare only for their own
          wallet, and hand-building DEX calldata without a verified ABI is how funds get lost. View quotes in the
          section below, or run the agent locally for a gated swap.
        </p>
      </div>
    </div>
  );
}

export function PrivyWalletSection() {
  if (!APP_ID) {
    return (
      <div className="border border-rule-cobalt bg-[#F8F9FE] px-5 py-6">
        <p className="max-w-[520px] font-sans-clean text-[11.5px] font-medium leading-[1.5] text-ink">
          Visitor wallets need a Privy app. Create one at{" "}
          <a href="https://dashboard.privy.io" target="_blank" rel="noreferrer" className="text-cobalt underline underline-offset-4">
            dashboard.privy.io
          </a>
          , enable embedded wallets, then set{" "}
          <code className="font-mono-code text-[10.5px] text-cobalt">NEXT_PUBLIC_PRIVY_APP_ID</code> in{" "}
          <code className="font-mono-code text-[10.5px]">apps/web/.env.local</code> and rebuild.
        </p>
      </div>
    );
  }
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        supportedChains: [robinhoodChain],
        defaultChain: robinhoodChain,
        appearance: { theme: "light", accentColor: "#2743ce" },
      }}
    >
      <WalletPanel />
    </PrivyProvider>
  );
}
