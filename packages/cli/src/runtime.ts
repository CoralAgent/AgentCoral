/**
 * Boot: resolve config, open the reef, wire skills, build the engine.
 * One factory so every command sees exactly the same object graph.
 */
import {
  CoralEngine,
  CoralMemory,
  RiskManager,
  SkillRouter,
  type CoralConfig,
  resolveConfig,
} from "@coral/core";
import { OakMcp, OakTokenSource, RobinhoodChain, RobinhoodMcp, allSkills, createSource, type MarketDataSource } from "@coral/skills";
import { geminiEmbedder } from "./embeddings.js";

export interface Runtime {
  config: CoralConfig;
  memory: CoralMemory;
  router: SkillRouter;
  risk: RiskManager;
  engine: CoralEngine;
  source: MarketDataSource;
  tokenSource: MarketDataSource;
  mcp: RobinhoodMcp;
  oak: OakMcp;
  chain: RobinhoodChain;
  close: () => void;
}

export function boot(overrides: Partial<CoralConfig> = {}): Runtime {
  const config = resolveConfig(overrides);
  const memory = new CoralMemory(config.dbPath);
  const chain = new RobinhoodChain(config.robinhood.chainRpc);
  const mcp = new RobinhoodMcp({ url: config.robinhood.mcpUrl, token: config.robinhood.mcpToken });
  const oak = new OakMcp({ command: config.oak.command, args: config.oak.args });
  const router = new SkillRouter().register(...allSkills({ mcp: () => mcp, chain, oak: () => oak }));
  router.syncZones(memory.zones());

  const risk = new RiskManager(RiskManager.forMode(config.mode));
  const engine = new CoralEngine({ config, memory, router, risk, embedder: geminiEmbedder });
  const source = createSource({ mcpUrl: config.robinhood.mcpUrl, mcpToken: config.robinhood.mcpToken, home: config.home });
  const tokenSource = new OakTokenSource({ oak: () => oak, home: config.home });

  return {
    config,
    memory,
    router,
    risk,
    engine,
    source,
    tokenSource,
    mcp,
    oak,
    chain,
    close: () => {
      memory.close();
      void oak.disconnect();
    },
  };
}

/** Parse "AAPL,NVDA" or ["AAPL","NVDA", "0x6511..."] into a clean list. Addresses keep their case-safe form. */
export function parseSymbols(input: string | string[] | undefined): string[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : input.split(",");
  return [
    ...new Set(
      list
        .map((s) => s.trim())
        .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s) || /^[A-Z0-9.\-]{1,10}$/i.test(s))
        .map((s) => (s.startsWith("0x") ? s.toLowerCase() : s.toUpperCase())),
    ),
  ];
}
