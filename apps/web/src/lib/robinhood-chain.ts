import { defineChain } from "viem";

/** Robinhood Chain — mainnet L2 where CORAL/USDG live. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
});

export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const CORAL_ADDRESS = "0x193922b3ce4f5377a71e933ea2b94439f69de6e8";
