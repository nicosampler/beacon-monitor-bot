import { env } from "@/src/env.js";

export function getOldestLookbackSlot() {
  return env.BEACON_LOOKBACK_SLOT;
}

function getCurrentSlot() {
  const currentTimestamp = Date.now();
  return Math.floor(
    (currentTimestamp - env.BEACON_GENESIS_TIMESTAMP) /
      (env.BEACON_SLOT_DURATION_IN_SECONDS * 1000)
  );
}
