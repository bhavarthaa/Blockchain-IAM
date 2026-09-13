# Blockchain IAM backend

This directory contains the modular Express API, SIWE authentication,
Prisma/PostgreSQL projections, relayed blockchain transaction lifecycle, and
checkpointed/indexed event ingestion. Smart contracts remain authoritative;
the database is never updated optimistically by request handlers.

## Local setup

1. Install Node.js 20+ and Docker Desktop.
2. Start the local PostgreSQL service:

```bash
docker compose up -d postgres
```

3. Copy `.env.example` to `.env`. The example uses development-only credentials;
   do not reuse them in shared or production environments.
4. Run:

```bash
npm install
npm run db:setup
```

`db:setup` generates the client, applies committed migrations, and runs the
idempotent development seed. The seed contains public-looking placeholder
addresses and hashes only; it never stores private keys, seed phrases, or
signatures. Copy `.env.example` to `.env` and configure deployed contract
addresses before using blockchain writes.

To stop the local database without deleting its data:

```bash
docker compose down
```

Useful commands:

```bash
npm run db:format
npm run db:validate
npm run db:migrate:deploy
npm run db:seed
npm run typecheck
npm test
```

Run the API with `npm run dev` or `npm start`. Every write requires an
`Idempotency-Key`, returns `202`/`SUBMITTED`, and becomes a final projection
only after the receipt/indexer observes canonical events. `RELAYER_PRIVATE_KEY`
is optional for read-only deployments and must never be logged or committed.

## Event indexer

Set `INDEXER_ENABLED=true`, the four contract addresses, and
`DEPLOYMENT_BLOCK` to start indexing. The worker decodes events directly from
the contract artifacts (including inherited ERC-721 and AccessControl events)
and stores ABI parameters, normalized addresses, block/transaction
provenance, and confirmation counts in `indexed_events`.

Indexing is deliberately conservative:

- only blocks at or below `head - CONFIRMATIONS_REQUIRED` are committed;
- event ingestion and the block checkpoint are one PostgreSQL transaction, so
  a restart replays an incomplete batch safely;
- `(chainId, transactionHash, logIndex)` is the durable idempotency key;
- canonical block hashes are retained for empty ranges as well as eventful
  ranges. On startup a hash mismatch searches the retained history for a
  common ancestor, marks affected events `REVERTED`, marks their transactions
  `REORGED`, and replays the canonical range;
- failed event/projection work is retained with an error, retry count, and
  backoff timestamp. A later replay retries it without advancing the cursor.

The `/api/v1/indexer/status`, `/replay`, and `/reconcile` endpoints remain
operational controls; reconciliation should be run after a reorg or a long
RPC/database interruption.
