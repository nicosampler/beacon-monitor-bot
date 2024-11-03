import { env } from "@/src/env.js";

let oldestLookbackSlot: number | null = null;

export function getOldestLookbackSlot() {
  if (oldestLookbackSlot !== null) {
    return oldestLookbackSlot;
  }

  oldestLookbackSlot =
    env.BEACON_LOOKBACK_SLOT === 0
      ? Math.max(0, getCurrentSlot() - env.BEACON_SLOTS_PER_EPOCH * 2)
      : env.BEACON_LOOKBACK_SLOT;

  return oldestLookbackSlot;
}

function getCurrentSlot() {
  const currentTimestamp = Date.now();
  return Math.floor(
    (currentTimestamp - env.BEACON_GENESIS_TIMESTAMP) /
      (env.BEACON_SLOT_DURATION_IN_SECONDS * 1000)
  );
}
