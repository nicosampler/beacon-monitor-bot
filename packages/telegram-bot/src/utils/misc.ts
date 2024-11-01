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
  PENDING_INITIALIZED: "pending_initialized",
  PENDING_QUEUED: "pending_queued",
  ACTIVE_ONGOING: "active_ongoing",
  ACTIVE_EXITING: "active_exiting",
  ACTIVE_SLASHED: "active_slashed",
  EXITED_UNSLASHED: "exited_unslashed",
  EXITED_SLASHED: "exited_slashed",
  WITHDRAWAL_POSSIBLE: "withdrawal_possible",
  WITHDRAWAL_DONE: "withdrawal_done",
};
