/**
 * @coral/skills — everything CORAL can actually do, plus where data comes from.
 */
export { observationFromBars, momentum, rsi, sma, volatility } from "./indicators.js";
export type { Bar } from "./indicators.js";

export { RobinhoodMcp, normaliseBars, quotePrice } from "./robinhood-mcp.js";
export type { McpToolInfo, RobinhoodMcpOptions } from "./robinhood-mcp.js";

export { RobinhoodChain, decodeString, formatUnits } from "./robinhood-chain.js";
export type { ChainInfo } from "./robinhood-chain.js";

export { RobinhoodMcpSource, SyntheticSource, YahooSource, createSource, yahooDaily } from "./market-data.js";
export type { SourceOptions } from "./market-data.js";
export type { MarketDataSource } from "@coral/core";

export { OakMcp, toBaseUnits } from "./oak-mcp.js";
export type { OakMcpOptions, OakQuote, OakTokenInfo } from "./oak-mcp.js";
export { OakTokenSource } from "./oak-source.js";
export type { OakTokenSourceOptions } from "./oak-source.js";
export { onchainSwap } from "./oak-swap.js";
export type { OnchainSwapOpts, OnchainSwapResult } from "./oak-swap.js";
export { createSigner, isAddress, publicClientFor, robinhoodChain, signerBalances } from "./direct-signer.js";
export type { Address, Signer, SignerBalance } from "./direct-signer.js";

export { robinhoodMcpSkills } from "./robinhood-mcp.skills.js";
export { robinhoodChainSkills } from "./robinhood-chain.skills.js";
export { researchSkills } from "./research.skills.js";
export { oakSkills } from "./oak.skills.js";
export type { TechnicalRead } from "./research.skills.js";

import type { Skill } from "@coral/core";
import { robinhoodMcpSkills } from "./robinhood-mcp.skills.js";
import { robinhoodChainSkills } from "./robinhood-chain.skills.js";
import { researchSkills } from "./research.skills.js";
import { oakSkills } from "./oak.skills.js";
import type { RobinhoodMcp } from "./robinhood-mcp.js";
import type { RobinhoodChain } from "./robinhood-chain.js";
import type { OakMcp } from "./oak-mcp.js";

export interface AllSkillDeps {
  mcp: () => RobinhoodMcp;
  chain: RobinhoodChain;
  oak: () => OakMcp;
}

/** The full skill library, wired once at boot. */
export function allSkills(deps: AllSkillDeps): Skill[] {
  return [
    ...robinhoodMcpSkills({ mcp: deps.mcp }),
    ...robinhoodChainSkills({ chain: deps.chain }),
    ...researchSkills({ mcp: deps.mcp }),
    ...oakSkills({ oak: deps.oak }),
  ];
}
