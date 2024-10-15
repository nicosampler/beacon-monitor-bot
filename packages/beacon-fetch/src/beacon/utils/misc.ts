import { env } from "@/src/env.js";

// Variable para almacenar el valor calculado
let oldestLookbackSlot: number | null = null;

export function getOldestLookbackSlot() {
  // Si ya se ha calculado, devolver el valor almacenado
  if (oldestLookbackSlot !== null) {
    return oldestLookbackSlot;
  }

  // Calcular el valor por primera vez
  oldestLookbackSlot =
    env.BEACON_LOOKBACK_SLOT === 0
      ? Math.max(0, getCurrentSlot() - env.BEACON_SLOTS_PER_EPOCH * 2)
      : env.BEACON_LOOKBACK_SLOT;

  return oldestLookbackSlot;
}

// Function to get the current slot remains unchanged
function getCurrentSlot() {
  const currentTimestamp = Date.now();
  return Math.floor(
    (currentTimestamp - env.BEACON_GENESIS_TIMESTAMP) /
      (env.BEACON_SLOT_DURATION * 1000)
  );
}
