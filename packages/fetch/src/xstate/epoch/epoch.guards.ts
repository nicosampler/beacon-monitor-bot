import { getEpochFromSlot } from '@/src/beacon/utils/misc.js';
import {
  getEpochNumberFromTimestamp,
  getSlotNumberFromTimestamp,
} from '@/src/beacon/utils/time.js';
import { getSyncCommitteePeriodStartEpoch } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';

export const isFirstEpochOfSyncCommitteePeriod = ({
  context,
}: {
  context: { epoch: number };
}): boolean => {
  return context.epoch === getSyncCommitteePeriodStartEpoch(context.epoch);
};

export const isLookbackEpoch = ({ context }: { context: { epoch: number } }): boolean => {
  const lookbackEpoch = getEpochFromSlot(env.BEACON_LOOKBACK_SLOT);
  return context.epoch === lookbackEpoch;
};

export const canProcessEpoch = ({ context }: { context: { epoch: number } }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We need to wait for the epoch to start
  if (context.epoch > currentEpoch + 1) {
    return false;
  }

  return true;
};

export const canFetchCommittees = ({ context }: { context: { epoch: number } }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We can fetch up to 1 epoch in advance
  if (context.epoch >= currentEpoch + 1) {
    return false;
  }

  return true;
};

export const hasEpochEnded = ({ context }: { context: { endSlot: number } }): boolean => {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());
  return currentSlot > context.endSlot;
};

export const canFetchSyncCommittees = ({ context }: { context: { epoch: number } }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We can fetch up to 1 epoch in advance
  if (context.epoch > currentEpoch + 1) {
    return false;
  }

  return true;
};

export const hasEpochAlreadyStarted = ({
  context,
}: {
  context: { startSlot: number };
}): boolean => {
  const currentSlot = getSlotNumberFromTimestamp(new Date().getTime());
  return currentSlot >= context.startSlot;
};
