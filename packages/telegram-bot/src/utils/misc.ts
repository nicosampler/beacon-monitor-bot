import { OLD_DATE } from "@/src/constants/index.js";
import addMinutes from "date-fns/addMinutes";
import compareAsc from "date-fns/compareAsc";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatNumber(
  value: number,
  maxDigits = 5,
  symbol?: string
): string {
  const integerPart = Math.floor(value);
  const integerPartLength = integerPart.toString().length;

  if (integerPartLength >= maxDigits) {
    return `${symbol ? symbol : ""}${integerPart.toLocaleString()}`;
  } else {
    const maxDecimalDigits = maxDigits - integerPartLength;
    const roundedValue = value.toFixed(maxDecimalDigits);
    const finalNumber = parseFloat(roundedValue);
    const finalNumberString = finalNumber.toFixed(maxDecimalDigits);

    return `${symbol ? symbol : ""}${finalNumberString}`;
  }
}

export function isNotificationAllowed(
  prevNotification: Date | undefined | null,
  ignoreWithinMinutes: number
): boolean {
  const now = new Date();
  const coolDownTime = addMinutes(
    prevNotification || OLD_DATE,
    ignoreWithinMinutes
  );

  return compareAsc(now, coolDownTime) > 0;
}

export function isNumberInRange(value: string, min: number, max: number) {
  // Ensure the input is a number
  const num = Number(value);
  if (isNaN(num)) {
    return false;
  }

  // Check if the number is within the range
  return num >= min && num <= max;
}

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

const BEACON_SLOT_DURATION_IN_SECONDS = Number(
  process.env.BEACON_SLOT_DURATION_IN_SECONDS
);

export const slotsIn1h = 3600 / BEACON_SLOT_DURATION_IN_SECONDS;
export const slotsInDay = (24 * 3600) / BEACON_SLOT_DURATION_IN_SECONDS;
export const slotsInWeek = (7 * 24 * 3600) / BEACON_SLOT_DURATION_IN_SECONDS;
export const slotsInMonth = (30 * 24 * 3600) / BEACON_SLOT_DURATION_IN_SECONDS;

export const epochsIn1h = Math.floor(
  slotsIn1h / Number(process.env.BEACON_SLOTS_PER_EPOCH)
);
export const epochsInDay = Math.floor(
  slotsInDay / Number(process.env.BEACON_SLOTS_PER_EPOCH)
);
export const epochsInWeek = Math.floor(
  slotsInWeek / Number(process.env.BEACON_SLOTS_PER_EPOCH)
);
export const epochsInMonth = Math.floor(
  slotsInMonth / Number(process.env.BEACON_SLOTS_PER_EPOCH)
);

export const getEpochFromSlot = (slot: number) => {
  return Math.floor(slot / Number(process.env.BEACON_SLOTS_PER_EPOCH));
};

// Get start and end slots for a given epoch
export const getEpochSlots = (epoch: number) => {
  const slotsPerEpoch = Number(process.env.BEACON_SLOTS_PER_EPOCH);
  return {
    startSlot: epoch * slotsPerEpoch,
    endSlot: (epoch + 1) * slotsPerEpoch - 1,
  };
};
