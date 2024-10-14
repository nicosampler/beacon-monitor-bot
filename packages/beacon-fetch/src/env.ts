import { config } from "dotenv";
import { z } from "zod";

// Cargar variables de entorno
config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),

  // Beacon
  BEACON_GENESIS_TIMESTAMP: z.coerce.number().int().positive(),
  BEACON_SLOT_DURATION: z.coerce.number().int().positive(),
  BEACON_SLOTS_PER_EPOCH: z.coerce.number().int().positive(),
  BEACON_LOOKBACK_SLOT: z.coerce.number().int().min(0),
  BEACON_MAX_ATTESTATION_DELAY: z.coerce.number().int().min(2),

  // Beacon-node API
  BEACON_API_URL: z.string().url(),
  BEACON_API_KEY: z.string().optional(),
  BEACON_API_REQUEST_PER_SECOND: z.coerce.number().int().positive(),
  BEACON_API_REQUEST_PER_MINUTE: z.coerce.number().int().positive(),
});

export type EnvType = z.infer<typeof envSchema>;

let envInstance: EnvType | null = null;

function createEnv(): EnvType {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Environment variables validation failed: ${result.error.message}`
    );
  }

  return result.data;
}

export const env = envInstance ?? createEnv();
