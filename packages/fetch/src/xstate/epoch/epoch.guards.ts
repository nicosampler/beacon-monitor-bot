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

export const hasNextEpoch = ({ event }: { event: any }): boolean => {
  return event.output !== null;
};

export const canProcessEpoch = ({ context }: { context: { epoch: number } }): boolean => {
  const currentEpoch = getEpochNumberFromTimestamp(new Date().getTime());

  // We need to wait for the epoch to start
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

  // We need to wait for the current slot to be greater than the first slot of the epoch
  return currentSlot > context.startSlot;
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
  // First condition: validators must have been fetched for the current epoch
  // if (!context.validatorsInfoFetched) {
  //   return false;
  // }

  // Second condition: current slot must be greater than the epoch's end slot
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
