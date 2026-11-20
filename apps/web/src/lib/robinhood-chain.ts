import { defineChain } from "viem";

/** Robinhood Chain — mainnet L2 where OAK/USDG live. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
});

export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const OAK_ADDRESS = "0x6511c233790Ec10f7d673c64DC82C3F941D57828";
