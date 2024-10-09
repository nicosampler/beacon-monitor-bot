import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import { subDays, subSeconds } from "date-fns";

const initiatedAt = new Date();

export function getOldestLookbackSlot() {
  const timestamp =
    env.BEACON_LOOKBACK_DAYS == 0
      ? subSeconds(
          initiatedAt,
          env.BEACON_SLOT_DURATION * env.BEACON_SLOTS_PER_EPOCH * 2
        ).getTime()
      : subDays(initiatedAt, env.BEACON_LOOKBACK_DAYS).getTime();

  return getSlotNumberFromTimestamp(timestamp);
}
