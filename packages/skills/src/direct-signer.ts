/**
 * Direct signer — a dedicated wallet key held in env, signing with viem.
 *
 * This is the alternative custody path to Chainbridge: Chainbridge keeps its key in the OS
 * keychain and wraps every action in spending limits, simulation, and an
 * ERC-8004 identity. A CORAL_SIGNER_KEY wallet skips all of that — the key
 * sits plaintext in .env and CORAL signs transactions itself.
 *
 * Scope is deliberately narrow: balance reads plus native/ERC-20 transfers.
 * ERC-20 transfer is a standard, verified ABI — safe to build. Swaps are NOT
 * built here: no verified router ABI for Robinhood Chain exists in-repo, and
 * hand-rolling DEX calldata is how funds get lost. Use Chainbridge for swaps.
 *
 * The RiskManager still gates every send — order-size and deployed-capital
 * limits apply to this wallet exactly as they do to trades.
 */
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  parseEther,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import type { Chain, PublicClient } from "viem";
import type { CoralConfig } from "@coral/core";

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export interface Signer {
  address: Address;
  sendNative(to: Address, amountEth: string): Promise<`0x${string}`>;
  sendErc20(token: Address, to: Address, amount: string, decimals: number): Promise<`0x${string}`>;
}

export interface SignerBalance {
  symbol: string;
  address: Address | null;
  raw: bigint;
  decimals: number;
  human: string;
}

export function robinhoodChain(rpc: string): Chain {
  return defineChain({
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

export function publicClientFor(config: CoralConfig): PublicClient {
  return createPublicClient({
    chain: robinhoodChain(config.robinhood.chainRpc),
    transport: http(config.robinhood.chainRpc),
  });
}

/** Build a signer from config. Returns null with a reason when no key is set. */
export function createSigner(config: CoralConfig): { signer: Signer } | { signer: null; reason: string } {
  const key = config.signerKey;
  if (!key) {
    return { signer: null, reason: "no CORAL_SIGNER_KEY set — add a dedicated wallet key to .env" };
  }
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return { signer: null, reason: "CORAL_SIGNER_KEY is not a 32-byte hex key" };
  }
  const account = privateKeyToAccount(normalized as `0x${string}`);
  const chain = robinhoodChain(config.robinhood.chainRpc);
  const client = createWalletClient({
    account,
    chain,
    transport: http(config.robinhood.chainRpc),
  });
  return {
    signer: {
      address: account.address,
      async sendNative(to, amountEth) {
        return client.sendTransaction({ to, value: parseEther(amountEth) });
      },
      async sendErc20(token, to, amount, decimals) {
        const data = encodeFunctionData({
          abi: ERC20,
          functionName: "transfer",
          args: [to, parseUnits(amount, decimals)],
        });
        return client.sendTransaction({ to: token, data });
      },
    },
  };
}

/** ETH + ERC-20 balances for an address. `tokens` lists extra contracts to check. */
export async function signerBalances(
  config: CoralConfig,
  address: Address,
  tokens: Address[] = [],
): Promise<SignerBalance[]> {
  const client = publicClientFor(config);
  const out: SignerBalance[] = [];
  const eth = await client.getBalance({ address });
  out.push({ symbol: "ETH", address: null, raw: eth, decimals: 18, human: formatUnits(eth, 18) });
  for (const token of tokens) {
    try {
      const [raw, decimals, symbol] = await Promise.all([
        client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [address] }),
        client.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
        client.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => "???"),
      ]);
      out.push({
        symbol: String(symbol),
        address: token,
        raw: raw as bigint,
        decimals: decimals as number,
        human: formatUnits(raw as bigint, decimals as number),
      });
    } catch {
      out.push({ symbol: "???", address: token, raw: 0n, decimals: 0, human: "unreadable" });
    }
  }
  return out;
}

export { isAddress };
export type { Address };
