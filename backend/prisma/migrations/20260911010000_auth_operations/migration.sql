CREATE TABLE "auth_nonces" (
    "id" TEXT NOT NULL,
    "nonce" VARCHAR(128) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "uri" VARCHAR(2048) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_nonces_nonce_key" ON "auth_nonces"("nonce");
CREATE INDEX "auth_nonces_address_chainId_expiresAt_idx" ON "auth_nonces"("address", "chainId", "expiresAt");

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "tokenId" VARCHAR(128) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_sessions_tokenId_key" ON "auth_sessions"("tokenId");
CREATE INDEX "auth_sessions_address_chainId_expiresAt_idx" ON "auth_sessions"("address", "chainId", "expiresAt");

CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "route" VARCHAR(255) NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "operationId" TEXT,
    "response" JSONB,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_records_walletAddress_route_key_key" ON "idempotency_records"("walletAddress", "route", "key");
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");
