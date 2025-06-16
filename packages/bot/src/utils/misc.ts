import addMinutes from 'date-fns/addMinutes';
import compareAsc from 'date-fns/compareAsc';

import { OLD_DATE } from '@/src/constants/index.js';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatNumber(value: number, maxDigits = 5, symbol?: string): string {
  const integerPart = Math.floor(value);
  const integerPartLength = integerPart.toString().length;

  // If the number is larger than maxDigits, show it completely without decimals
  if (integerPartLength > maxDigits) {
    return `${symbol ? symbol : ''}${integerPart.toLocaleString('en-US')}`;
  } else {
    const maxDecimalDigits = maxDigits - integerPartLength;
    const roundedValue = value.toFixed(maxDecimalDigits);
    const finalNumber = parseFloat(roundedValue);

    // If integer part is larger than maxDigits, show without decimals
    if (integerPartLength >= maxDigits) {
      return `${symbol ? symbol : ''}${integerPart.toLocaleString('en-US')}`;
    }

    const finalNumberString = finalNumber.toLocaleString('en-US', {
      minimumFractionDigits: maxDecimalDigits,
      maximumFractionDigits: maxDecimalDigits,
      minimumIntegerDigits: 1,
    });

    // Pad with zeros to maintain fixed width
    const totalLength = maxDigits + (finalNumberString.includes('.') ? 1 : 0); // +1 for decimal point
    const paddedNumber = finalNumberString.padStart(totalLength, '0');

    return `${symbol ? symbol : ''}${paddedNumber}`;
  }
}

export function isNotificationAllowed(
  prevNotification: Date | undefined | null,
  ignoreWithinMinutes: number,
): boolean {
  const now = new Date();
  const coolDownTime = addMinutes(prevNotification || OLD_DATE, ignoreWithinMinutes);

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
