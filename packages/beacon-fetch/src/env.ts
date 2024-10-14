import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const _env = process.env;
export const env = createEnv({
  clientPrefix: "FIX_SERVER_ERROR",
  client: {},
  server: {
    DATABASE_URL: z.string().url(),
    // Beacon
    BEACON_GENESIS_TIMESTAMP: z.number().int().positive(),
    BEACON_SLOT_DURATION: z.number().int().positive(),
    BEACON_SLOTS_PER_EPOCH: z.number().int().positive(),
    BEACON_LOOKBACK_SLOT: z.number().int().min(0),
    BEACON_MAX_ATTESTATION_DELAY: z.number().int().min(2),
    // Beacon-node API TODO: RENAME to BEACON_RPC
    BEACON_API_URL: z.string().url(),
    BEACON_API_KEY: z.string().optional(),
    BEACON_API_REQUEST_PER_SECOND: z.number().int().positive(),
    BEACON_API_REQUEST_PER_MINUTE: z.number().int().positive(),
  },
  runtimeEnv: {
    ..._env,
    // Beacon
    BEACON_GENESIS_TIMESTAMP: Number(_env.BEACON_GENESIS_TIMESTAMP),
    BEACON_SLOT_DURATION: Number(_env.BEACON_SLOT_DURATION),
    BEACON_SLOTS_PER_EPOCH: Number(_env.BEACON_SLOTS_PER_EPOCH),
    BEACON_LOOKBACK_SLOT: Number(_env.BEACON_LOOKBACK_SLOT),
    BEACON_MAX_ATTESTATION_DELAY: Number(_env.BEACON_MAX_ATTESTATION_DELAY),
    // Beacon-node API
    BEACON_API_REQUEST_PER_SECOND: Number(_env.BEACON_API_REQUEST_PER_SECOND),
    BEACON_API_REQUEST_PER_MINUTE: Number(_env.BEACON_API_REQUEST_PER_MINUTE),
  },
  emptyStringAsUndefined: true,
});
