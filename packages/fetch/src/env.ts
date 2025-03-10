import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const _env = process.env;

export const env = createEnv({
  clientPrefix: "FIX_SERVER_ERROR",
  client: {},
  server: {
    LOG_OUTPUT: z.enum(["file", "console"]).optional(),
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).optional(),

    DATABASE_URL: z.string().url(),
    // Beacon
    BEACON_GENESIS_TIMESTAMP: z.number().int().positive(),
    BEACON_SLOT_DURATION_IN_SECONDS: z.number().int().positive(),
    BEACON_SLOTS_PER_EPOCH: z.number().int().positive(),
    BEACON_DELAY_SLOTS_TO_HEAD: z.number().int().min(2),
    BEACON_LOOKBACK_SLOT: z.number().int().min(0),
    BEACON_MAX_ATTESTATION_DELAY: z.number().int().min(2),
    // Beacon API
    BEACON_API_URL: z.string().url(),
    BEACON_API_BKP_URL: z.string().url(),
    BEACON_API_REQUEST_PER_SECOND: z.number().int().positive(),
    BEACON_API_REQUEST_PER_MINUTE: z.number().int().positive(),

    // Execution
    EXECUTION_BLOCK_LOOKBACK: z.number().int().positive(),
    // Execution API
    EXECUTION_API_URL: z.string().url(),
    EXECUTION_API_KEY: z.string().optional(),
    EXECUTION_API_BKP_URL: z.string().url(),
    EXECUTION_API_BKP_KEY: z.string().optional(),
    EXECUTION_API_REQUEST_PER_SECOND: z.number().int().positive(),
    EXECUTION_API_REQUEST_PER_MINUTE: z.number().int().positive(),
  },
  runtimeEnv: {
    ..._env,

    // Beacon config
    BEACON_GENESIS_TIMESTAMP: Number(_env.BEACON_GENESIS_TIMESTAMP),
    BEACON_SLOT_DURATION_IN_SECONDS: Number(
      _env.BEACON_SLOT_DURATION_IN_SECONDS
    ),
    BEACON_SLOTS_PER_EPOCH: Number(_env.BEACON_SLOTS_PER_EPOCH),
    BEACON_DELAY_SLOTS_TO_HEAD: Number(_env.BEACON_DELAY_SLOTS_TO_HEAD),
    BEACON_LOOKBACK_SLOT: Number(_env.BEACON_LOOKBACK_SLOT),
    BEACON_MAX_ATTESTATION_DELAY: Number(_env.BEACON_MAX_ATTESTATION_DELAY),
    // Beacon-node API
    BEACON_API_REQUEST_PER_SECOND: Number(_env.BEACON_API_REQUEST_PER_SECOND),
    BEACON_API_REQUEST_PER_MINUTE: Number(_env.BEACON_API_REQUEST_PER_MINUTE),

    // Execution config
    EXECUTION_BLOCK_LOOKBACK: Number(_env.EXECUTION_BLOCK_LOOKBACK),
    // Execution API
    EXECUTION_API_REQUEST_PER_SECOND: Number(
      _env.EXECUTION_API_REQUEST_PER_SECOND
    ),
    EXECUTION_API_REQUEST_PER_MINUTE: Number(
      _env.EXECUTION_API_REQUEST_PER_MINUTE
    ),
  },
  emptyStringAsUndefined: true,
});
