import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const _env = process.env;

export const env = createEnv({
  clientPrefix: 'FIX_SERVER_ERROR',
  client: {},
  server: {
    // Database
    DATABASE_URL: z.string().url(),

    // Telegram
    TG_BOT_TOKEN: z.string(),
    TG_ADMIN_USER_IDS: z.preprocess(
      (val) => (typeof val === 'string' ? val.split(',').map(Number) : []),
      z.array(z.number()),
    ),

    // Logging
    LOG_OUTPUT: z.enum(['file', 'console']).optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),

    // Node Sentinel
    NODE_SENTINEL_URL: z.string().url(),
    NODE_SENTINEL_CHAIN: z.enum(['gnosis', 'ethereum']),
    NODE_SENTINEL_PRIVATE_KEY: z.string().optional(),
    NODE_SENTINEL_API_URL: z.string().url(),
    NODE_SENTINEL_API_PORT: z.number().int().positive().default(3005),
    NODE_SENTINEL_API_SECRET_KEY: z.string(),
    // Beacon
    BEACON_GENESIS_TIMESTAMP: z
      .number()
      .int()
      .positive()
      .transform((val) => val * (process.env.NODE_SENTINEL_CHAIN === 'gnosis' ? 1 : 1000)),
    BEACON_SLOT_DURATION_IN_SECONDS: z.number().int().positive(),
    BEACON_SLOTS_PER_EPOCH: z.number().int().positive(),
    BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD: z.number().int().positive(),
    BEACON_DELAY_SLOTS_TO_HEAD: z.number().int().positive(),
    BEACON_LOOKBACK_SLOT: z.number().int().min(0),
    BEACON_MAX_ATTESTATION_DELAY: z.number().int().min(5),
    // Beacon API
    BEACON_API_URL: z.string().url(),
    BEACON_API_BKP_URL: z.string().url(),
    BEACON_API_REQUEST_PER_SECOND: z.number().int().positive(),

    // Execution
    EXECUTION_BLOCK_LOOKBACK: z.number().int().positive(),
    // Execution API
    EXECUTION_EXPLORER_URL: z.string().url(),
    EXECUTION_API_URL: z.string().url(),
    EXECUTION_API_KEY: z.string().optional(),
    EXECUTION_API_BKP_URL: z.string().url(),
    EXECUTION_API_BKP_KEY: z.string().optional(),
    EXECUTION_API_REQUEST_PER_SECOND: z.number().int().positive(),
    EXECUTION_RPC_URL: z.string().url(),

    // Blockchain
    BLOCKCHAIN_TOKEN_SYMBOL: z.string(),
    BLOCKCHAIN_FEE_REWARDS_IN_STABLE: z.preprocess((val) => val === 'true', z.boolean()),
    BLOCKCHAIN_FEE_REWARDS_SYMBOL: z.string(),
    BLOCKCHAIN_SC_DEPOSIT_ADDRESS: z.string(),

    // Coingecko
    COINGECKO_TOKEN_PRICE_API_URL: z.string(),
    COINGECKO_TOKEN_NAME: z.string(),
  },
  runtimeEnv: {
    ..._env,

    // Beacon config
    BEACON_GENESIS_TIMESTAMP: Number(_env['BEACON_GENESIS_TIMESTAMP']),
    BEACON_SLOT_DURATION_IN_SECONDS: Number(_env['BEACON_SLOT_DURATION_IN_SECONDS']),
    BEACON_SLOTS_PER_EPOCH: Number(_env['BEACON_SLOTS_PER_EPOCH']),
    BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD: Number(
      _env['BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD'],
    ),
    BEACON_DELAY_SLOTS_TO_HEAD: Number(_env['BEACON_DELAY_SLOTS_TO_HEAD']),
    BEACON_LOOKBACK_SLOT: Number(_env['BEACON_LOOKBACK_SLOT']),
    BEACON_MAX_ATTESTATION_DELAY: Number(_env['BEACON_MAX_ATTESTATION_DELAY']),
    // Beacon-node API
    BEACON_API_REQUEST_PER_SECOND: Number(_env['BEACON_API_REQUEST_PER_SECOND']),

    // Execution config
    EXECUTION_BLOCK_LOOKBACK: Number(_env['EXECUTION_BLOCK_LOOKBACK']),
    // Execution API
    EXECUTION_API_REQUEST_PER_SECOND: Number(_env['EXECUTION_API_REQUEST_PER_SECOND']),
  },
  emptyStringAsUndefined: true,
});
