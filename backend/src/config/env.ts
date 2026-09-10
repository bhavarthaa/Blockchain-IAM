import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/blockchain_iam?schema=public"),
  RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
  IDENTITY_REGISTRY_ADDRESS: z.string().optional(),
  ROLE_MANAGER_ADDRESS: z.string().optional(),
  ASSET_NFT_ADDRESS: z.string().optional(),
  AUDIT_LOGGER_ADDRESS: z.string().optional(),
  SIWE_DOMAIN: z.string().min(1).default("localhost:4000"),
  SIWE_URI: z.string().url().default("http://localhost:4000"),
  SESSION_SECRET: z.string().min(32).default("development-only-change-me-please-32-chars"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  CONFIRMATIONS_REQUIRED: z.coerce.number().int().min(0).default(2),
  INDEXER_POLL_MS: z.coerce.number().int().min(250).default(5000),
  INDEXER_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(2_000),
  INDEXER_ENABLED: z.preprocess((value) => value === true || value === "true", z.boolean()).default(false),
  DEPLOYMENT_BLOCK: z.coerce.bigint().min(0n).default(0n),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);

export const config = parsed.data;
if (config.NODE_ENV === "production" && config.SESSION_SECRET === "development-only-change-me-please-32-chars") {
  throw new Error("SESSION_SECRET must be configured in production");
}
export type Config = typeof config;
