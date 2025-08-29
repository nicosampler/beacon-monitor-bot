import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const _env = process.env;

export const env = createEnv({
  clientPrefix: 'IF_NOT_PROVIDED_IT_FAILS',
  client: {},
  server: {
    // App
    ENVIRONMENT: z.enum(['development', 'production']).default('development'),

    // Database
    DATABASE_URL: z.string().url(),

    // Telegram
    TG_BOT_TOKEN: z.string(),
    TG_ADMIN_USER_IDS: z.preprocess(
      (val) => (typeof val === 'string' ? val.split(',').map(Number) : []),
      z.array(z.number()),
    ),
    TG_BOT_IS_DEV: z.preprocess((val) => val === 'true', z.boolean().optional().default(false)),

    // Prisma
    // Logging
    LOG_OUTPUT: z.enum(['file', 'console']).optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),

    // Node Sentinel
    NODE_SENTINEL_URL: z.string().url(),
    NODE_SENTINEL_CHAIN: z.enum(['gnosis', 'ethereum']),
    NODE_SENTINEL_PRIVATE_KEY: z.string().optional(),
    NODE_SENTINEL_API_URL: z.string().url(),
    NODE_SENTINEL_API_PORT: z.preprocess((val) => {
      if (val === undefined || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    }, z.number().int().positive().default(3005)),
    NODE_SENTINEL_API_SECRET_KEY: z.string(),

    // Beacon
    BEACON_GENESIS_TIMESTAMP: z.preprocess((val) => {
      const numVal = Number(val);
      return numVal * (process.env.NODE_SENTINEL_CHAIN === 'gnosis' ? 1 : 1000);
    }, z.number().int().positive()),
    BEACON_SLOT_DURATION_IN_SECONDS: z.preprocess(
      (val) => Number(val),
      z.number().int().positive(),
    ),
    BEACON_SLOTS_PER_EPOCH: z.preprocess((val) => Number(val), z.number().int().positive()),
    BEACON_DELAY_SLOTS_TO_HEAD: z.preprocess((val) => Number(val), z.number().int().positive()),
    BEACON_LOOKBACK_SLOT: z.preprocess((val) => Number(val), z.number().int().min(0)),
    BEACON_MAX_ATTESTATION_DELAY: z.preprocess((val) => Number(val), z.number().int().min(2)),

    // Beacon API
    BEACON_API_URL: z.string().url(),
    BEACON_API_BKP_URL: z.string().url(),
    BEACON_API_REQUEST_PER_SECOND: z.preprocess((val) => Number(val), z.number().int().positive()),

    // Execution API
    EXECUTION_EXPLORER_URL: z.string().url(),
    EXECUTION_API_URL: z.string().url(),
    EXECUTION_API_KEY: z.string().optional(),
    EXECUTION_API_BKP_URL: z.string().url(),
    EXECUTION_API_BKP_KEY: z.string().optional(),
    EXECUTION_API_REQUEST_PER_SECOND: z.preprocess(
      (val) => Number(val),
      z.number().int().positive(),
    ),
    EXECUTION_RPC_URL: z.string().url(),

    // Blockchain
    BLOCKCHAIN_CHAIN_ID: z.preprocess((val) => Number(val), z.number().int().positive()),
    BLOCKCHAIN_TOKEN_SYMBOL: z.string(),
    BLOCKCHAIN_CL_REWARDS_SYMBOL: z.string(),
    BLOCKCHAIN_EL_REWARDS_SYMBOL: z.string(),
    BLOCKCHAIN_FEE_REWARDS_IN_STABLE: z.preprocess((val) => val === 'true', z.boolean()),
    BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD: z.preprocess(
      (val) => Number(val),
      z.number().int().positive(),
    ),
    BLOCKCHAIN_FEE_REWARDS_SYMBOL: z.string(),
    BLOCKCHAIN_SC_DEPOSIT_ADDRESS: z.string(),

    // Coingecko
    COINGECKO_TOKEN_PRICE_API_URL: z.string(),
    COINGECKO_TOKEN_NAME: z.string(),
  },
  runtimeEnv: {
    ..._env,
  },
  emptyStringAsUndefined: true,
});
