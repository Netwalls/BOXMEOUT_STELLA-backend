/**
 * Indexer entry point.
 *
 * Starts the Soroban RPC event subscription loop.
 * Run as a separate process:
 *   npx ts-node src/indexer/index.ts
 *
 * Environment variables required:
 *   STELLAR_RPC_URL           - Soroban RPC endpoint
 *   MARKET_FACTORY_CONTRACT_ID - MarketFactory contract address
 *   TREASURY_CONTRACT_ID       - Treasury contract address (optional)
 *   DATABASE_URL               - PostgreSQL connection string
 */
import { startIndexer } from "../services/indexer.service";
import { logger } from "../logger";

startIndexer().catch((err) => {
  logger.fatal({ err }, "Indexer crashed");
  process.exit(1);
});
