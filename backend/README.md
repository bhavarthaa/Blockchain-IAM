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
