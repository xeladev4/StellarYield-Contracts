# StellarYield Backend

Express API for StellarYield. It indexes on-chain data, stores it in PostgreSQL,
and exposes REST endpoints for vault, user, and yield data.

## Prerequisites

- Node.js 20+
- npm
- Docker and Docker Compose

## Local Setup With Docker Compose

From this `backend/` directory:

```sh
docker compose up --build
```

The API is available at `http://localhost:3000`.

Check health:

```sh
curl http://localhost:3000/health
```

Run database migrations once:

```sh
docker compose --profile migrate run --rm db-migrate
```

Stop services:

```sh
docker compose down
```

Remove the local PostgreSQL volume:

```sh
docker compose down -v
```

## Local Setup Without Docker

Create a local environment file:

```sh
cp .env.example .env
```

Install dependencies, build, migrate, and start:

```sh
npm ci
npm run build
npm run db:migrate
npm start
```

For development with file watching:

```sh
npm run dev
```

## Available Scripts

- `npm run build` - compile TypeScript to `dist/`.
- `npm start` - run `node dist/index.js`.
- `npm run dev` - run the API with `tsx watch`.
- `npm run lint` - lint files under `src/`.
- `npm test` - run the Vitest suite.
- `npm run db:migrate` - apply `src/db/schema.sql` to PostgreSQL.

## Environment Variables

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP server port. |
| `NODE_ENV` | No | `development` | Runtime environment. |
| `DATABASE_URL` | Yes | none | PostgreSQL connection string. |
| `STELLAR_NETWORK` | No | `testnet` | Stellar network name. |
| `STELLAR_RPC_URL` | No | Soroban testnet RPC | Stellar RPC endpoint. |
| `STELLAR_NETWORK_PASSPHRASE` | No | Testnet passphrase | Network passphrase. |
| `VAULT_FACTORY_CONTRACT_ID` | **Recommended** | empty | Vault factory contract ID. **Required for event indexing.** If empty, the indexer will skip event polling and only update `indexer_state`, logging a warning at startup. |
| `ZKME_VERIFIER_CONTRACT_ID` | No | empty | zkMe verifier contract ID. |
| `INDEXER_START_LEDGER` | No | `0` | Ledger to begin indexing from. |
| `INDEXER_POLL_INTERVAL_MS` | No | `5000` | Indexer polling interval. |
| `WEBHOOK_SECRET` | No | empty | Optional webhook signing secret. |

Docker Compose reads `.env.example` and overrides `DATABASE_URL` so the backend
connects to the `postgres` service.

## API Routes

- `GET /health` - service and database health check.
- `GET /api/v1/vaults` - list vaults.
- `GET /api/v1/vaults/count` - return the total number of vaults.
- `GET /api/v1/vaults/factory/:factoryId` - list vaults for a factory.
- `GET /api/v1/vaults/:contractId` - get a vault by contract ID.
- `GET /api/v1/vaults/:contractId/positions` - list vault positions.
- `GET /api/v1/users/:address` - get a user by Stellar address.
- `GET /api/v1/users/:address/kyc?vaultId=:contractId` - live-read on-chain KYC status for a vault.
- `GET /api/v1/users/:address/portfolio` - get a user's portfolio.
- `GET /api/v1/yields/:contractId/epochs` - list vault yield epochs.
- `GET /api/v1/yields/:contractId/pending/:userAddress` - get pending yield.
