import { env } from "@/src/env.js";

export function getOldestLookbackSlot() {
  // If BEACON_LOOKBACK_SLOT is 0, we'll use a default of 2 epochs ago
  return env.BEACON_LOOKBACK_SLOT === 0
    ? Math.max(0, getCurrentSlot() - env.BEACON_SLOTS_PER_EPOCH * 2)
    : env.BEACON_LOOKBACK_SLOT;
}

// Add this new function to get the current slot
function getCurrentSlot() {
  const currentTimestamp = Date.now();
  return Math.floor((currentTimestamp - env.BEACON_GENESIS_TIMESTAMP) / (env.BEACON_SLOT_DURATION * 1000));
}
