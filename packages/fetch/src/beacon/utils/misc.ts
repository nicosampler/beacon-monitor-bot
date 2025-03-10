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

export const getEpochSlots = (epoch: number) => {
  const slotsPerEpoch = Number(env.BEACON_SLOTS_PER_EPOCH);
  return {
    startSlot: epoch * slotsPerEpoch,
    endSlot: (epoch + 1) * slotsPerEpoch - 1,
  };
};

export const getEpochFromSlot = (slot: number) => {
  return Math.floor(slot / Number(env.BEACON_SLOTS_PER_EPOCH));
};
