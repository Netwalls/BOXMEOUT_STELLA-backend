# BOXMEOUT Backend

Indexer and REST API for BOXMEOUT, a boxing prediction market on Stellar/Soroban.

- **API**: Express + Zod, documented in [`src/api/openapi.json`](src/api/openapi.json)
- **Indexer**: reads contract events from Soroban RPC and stores them in PostgreSQL
- **Storage**: PostgreSQL via Prisma, Redis + BullMQ for queues
- **Contracts**: see [BOXMEOUT_STELLA-contracts](https://github.com/Netwalls/BOXMEOUT_STELLA-contracts)

## Requirements

- Node.js 20+
- PostgreSQL
- Redis

## Getting started

```bash
npm install
npm run db:generate      # generate the Prisma client
npm run db:migrate       # apply migrations
npm run dev              # API with auto-reload
npm run indexer:dev      # indexer with auto-reload
```

## Configuration

Environment variables are validated with Zod in [`src/config.ts`](src/config.ts).

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `STELLAR_RPC_URL` | Soroban RPC endpoint (required) |
| `STELLAR_HORIZON_URL` | Horizon endpoint (required) |
| `STELLAR_NETWORK` | `testnet` (default) or `mainnet` |
| `MARKET_FACTORY_CONTRACT_ID` | Deployed MarketFactory contract |
| `TREASURY_CONTRACT_ID` | Deployed Treasury contract |
| `ADMIN_SECRET_KEY` | Stellar key used for admin transactions |
| `ADMIN_API_KEY` / `ORACLE_API_KEY` | API keys for admin and oracle endpoints |
| `REDIS_URL` | Redis connection string |
| `BOXREC_API_URL` | Optional fight data source |
| `CORS_ORIGINS` | Allowed origins |
| `TRUST_PROXY` | Express `trust proxy` setting (default `false`) |
| `PORT` | Defaults to `3001` |

See `src/config.ts` for the full list, defaults and validation rules.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run the API with auto-reload |
| `npm run build` / `npm start` | Compile and run the API |
| `npm run indexer` / `indexer:dev` | Run the event indexer |
| `npm test` | Run the Jest test suite |
| `npm run lint` / `type-check` | ESLint and TypeScript checks |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:check-drift` | Check migrations against the schema |

## Docker

The [`Dockerfile`](Dockerfile) is multi-stage and builds both the API and the indexer images.

## Layout

```
src/
  api/          routes, controllers, middleware, OpenAPI spec
  indexer/      contract event indexer entrypoint
  services/     market, bet, resolution, oracle, user and audit logic
  repositories/ database access
  events/       contract event handling
prisma/         schema and migrations
tests/          integration tests
```

## License

See the license in the [main repository](https://github.com/Netwalls/BOXMEOUT_STELLA).
