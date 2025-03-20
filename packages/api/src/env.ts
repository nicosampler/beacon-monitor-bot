import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const _env = process.env;

export const env = createEnv({
  clientPrefix: 'FIX_SERVER_ERROR',
  client: {},
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    API_SECRET_KEY: z.string(),

    PORT: z.string().default('3005'),
    LOG_OUTPUT: z.enum(['file', 'console']).optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
    NODE_SENTINEL_URL: z.string().url().optional(),

    // Beacon
    BEACON_GENESIS_TIMESTAMP: z.number().int().positive(),
    BEACON_SLOT_DURATION_IN_SECONDS: z.number().int().positive(),
    BEACON_SLOTS_PER_EPOCH: z.number().int().positive(),
    BEACON_DELAY_SLOTS_TO_HEAD: z.number().int().min(1),
    BEACON_LOOKBACK_SLOT: z.number().int().min(0),
    BEACON_MAX_ATTESTATION_DELAY: z.number().int().min(2),

    // Token price config
    COINGECKO_TOKEN_PRICE_API_URL: z.string().url(),
    COINGECKO_TOKEN_NAME: z.string(),
  },
  runtimeEnv: {
    ..._env,
    // Beacon config
    BEACON_GENESIS_TIMESTAMP: Number(_env['BEACON_GENESIS_TIMESTAMP']),
    BEACON_SLOT_DURATION_IN_SECONDS: Number(_env['BEACON_SLOT_DURATION_IN_SECONDS']),
    BEACON_SLOTS_PER_EPOCH: Number(_env['BEACON_SLOTS_PER_EPOCH']),
    BEACON_DELAY_SLOTS_TO_HEAD: Number(_env['BEACON_DELAY_SLOTS_TO_HEAD']),
    BEACON_LOOKBACK_SLOT: Number(_env['BEACON_LOOKBACK_SLOT']),
    BEACON_MAX_ATTESTATION_DELAY: Number(_env['BEACON_MAX_ATTESTATION_DELAY']),
  },
  emptyStringAsUndefined: true,
});
