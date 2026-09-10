# Backend database foundation

This directory contains the Prisma/PostgreSQL projection layer only. API routes,
authentication, and indexer workers are intentionally not included yet.

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
signatures.

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
```

All contract-derived values remain projections. Authorization and ownership
decisions must still be checked against the configured contracts.
