import { env } from "@/src/env.js";

export const VALIDATOR_STATUS = {
  pending_initialized: 0,
  pending_queued: 1,
  active_ongoing: 2,
  active_exiting: 3,
  active_slashed: 4,
  exited_unslashed: 5,
  exited_slashed: 6,
  withdrawal_possible: 7,
  withdrawal_done: 8,
} as const;

const SLOT_DURATION_MS = Number(env.BEACON_SLOT_DURATION_IN_SECONDS) * 1000;

export const slotsIn1h = 3600 / env.BEACON_SLOT_DURATION_IN_SECONDS;
export const slotsInDay = (24 * 3600) / env.BEACON_SLOT_DURATION_IN_SECONDS;
export const slotsInWeek =
  (7 * 24 * 3600) / env.BEACON_SLOT_DURATION_IN_SECONDS;
export const slotsInMonth =
  (30 * 24 * 3600) / env.BEACON_SLOT_DURATION_IN_SECONDS;

export const epochsIn1h = Math.floor(
  slotsIn1h / Number(env.BEACON_SLOTS_PER_EPOCH)
);
export const epochsInDay = Math.floor(
  slotsInDay / Number(env.BEACON_SLOTS_PER_EPOCH)
);
export const epochsInWeek = Math.floor(
  slotsInWeek / Number(env.BEACON_SLOTS_PER_EPOCH)
);
export const epochsInMonth = Math.floor(
  slotsInMonth / Number(env.BEACON_SLOTS_PER_EPOCH)
);

export const getEpochFromSlot = (slot: number) => {
  return Math.floor(slot / Number(env.BEACON_SLOTS_PER_EPOCH));
};

// Get start and end slots for a given epoch
export const getEpochSlots = (epoch: number) => {
  const slotsPerEpoch = Number(env.BEACON_SLOTS_PER_EPOCH);
  return {
    startSlot: epoch * slotsPerEpoch,
    endSlot: (epoch + 1) * slotsPerEpoch - 1,
  };
};

/**
 * Given a timestamp, determine the slot number.
 * @param timestamp - The timestamp in milliseconds.
 * @returns The corresponding slot number.
 */
export function getSlotNumberFromTimestamp(timestamp: number): number {
  if (timestamp < env.BEACON_GENESIS_TIMESTAMP) {
    throw new Error("Timestamp is before genesis");
  }
  return Math.floor(
    (timestamp - env.BEACON_GENESIS_TIMESTAMP) / SLOT_DURATION_MS
  );
}

/**
 * Given a slot number, determine the timestamp.
 * @param slotNumber - The slot number.
 * @returns The corresponding timestamp in milliseconds.
 */
export function getTimestampFromSlotNumber(slotNumber: number): number {
  if (slotNumber < 0) {
    throw new Error("Slot number cannot be negative");
  }
  return env.BEACON_GENESIS_TIMESTAMP + slotNumber * SLOT_DURATION_MS;
}

/**
 * Given a timestamp, determine the epoch number.
 * @param timestamp - The timestamp in milliseconds.
 * @returns The corresponding epoch number.
 */
export function getEpochNumberFromTimestamp(timestamp: number): number {
  const slotNumber = getSlotNumberFromTimestamp(timestamp);
  return Math.floor(slotNumber / env.BEACON_SLOTS_PER_EPOCH);
}

/**
 * Given an epoch number, determine the timestamp.
 * @param epochNumber - The epoch number.
 * @returns The corresponding timestamp in milliseconds.
 */
export function getTimestampFromEpochNumber(epochNumber: number): number {
  if (epochNumber < 0) {
    throw new Error("Epoch number cannot be negative");
  }

  const slotDuration = SLOT_DURATION_MS * env.BEACON_SLOTS_PER_EPOCH;

  return env.BEACON_GENESIS_TIMESTAMP + epochNumber * slotDuration;
}
