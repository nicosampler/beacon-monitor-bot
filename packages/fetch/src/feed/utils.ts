import { Prisma, LastSummaryUpdate } from '@prisma/client';
import memoizee from 'memoizee';
import ms from 'ms';

import { VALIDATOR_STATUS } from '@/src/constants/index.js';
import { env } from '@/src/env.js';
import { getPrisma } from '@/src/lib/prisma.js';
const prisma = getPrisma();

export const db_getLastSlot = async () =>
  await prisma.slot
    .findFirst({ orderBy: { slot: 'desc' }, select: { slot: true } })
    .then((d) => d?.slot);

export const db_getLastSlotWithAttestations = async () =>
  await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: 'desc' },
    select: { slot: true },
  });

export const db_getLastSlotInCommittee = async () =>
  await prisma.committee.findFirst({
    orderBy: { slot: 'desc' },
  });

export const db_getSlotsByRange = async (start: number, end: number) => {
  return prisma.slot.findMany({
    where: { slot: { gte: start, lte: end } },
  });
};

export const db_getSlotByNumber = async (slot: number) =>
  prisma.slot.findFirst({
    where: { slot },
    select: { slot: true, attestationsFetched: true, committee: true },
  });

export const db_existCommitteeForSlot = async (slot: number) => {
  const res = await prisma.committee.findFirst({
    where: { slot },
  });
  return res !== null;
};

export const db_hasEpochCommittees = async (epoch: number) => {
  const res = await prisma.epoch.findFirst({
    where: { epoch, committeesFetched: true },
  });
  return res !== null;
};

export const db_getLastSlotWithSyncRewards = async () =>
  await prisma.slot.findFirst({
    where: { blockAndSyncRewardsFetched: true },
    orderBy: { slot: 'desc' },
    select: { slot: true },
  });

export const db_getSlotByNumbers = async (slots: number[]) => {
  const res = await prisma.slot.findMany({
    where: { slot: { in: slots } },
  });
  return res.map((r) => r.slot);
};

export const db_getLastUnfetchedSlot = async () => {
  const res = await prisma.slot.findMany({
    where: { attestationsFetched: false },
    distinct: ['slot'],
    orderBy: { slot: 'asc' },
  });

  return res[0];
};

export const db_getLastProcessedEpoch = async () =>
  prisma.epoch.findFirst({
    where: {
      rewardsFetched: true,
    },
    orderBy: { epoch: 'desc' },
    select: { epoch: true },
  });

export const db_getEpochByNumber = async (epoch: number) =>
  prisma.epoch.findFirst({
    where: { epoch },
  });

export const db_getLastEpochWithCommittees = async () =>
  prisma.epoch.findFirst({
    where: { committeesFetched: true },
    orderBy: { epoch: 'desc' },
    select: { epoch: true },
  });

export const db_upsertEpoch = async (epoch: number) =>
  prisma.epoch.upsert({
    where: { epoch },
    create: { epoch, rewardsFetched: false },
    update: {},
  });

export const db_getUnprocessedSlots = async ({
  minSlot,
  maxSlot,
  orderBy,
  take,
}: {
  minSlot: number;
  maxSlot: number;
  orderBy: Prisma.SlotOrderByWithRelationInput;
  take: number;
}) =>
  prisma.slot.findMany({
    select: { slot: true },
    where: { attestationsFetched: false, slot: { gte: minSlot, lte: maxSlot } },
    orderBy,
    take,
  });

/**
 * Gets the committee validator counts for the last BEACON_SLOTS_PER_EPOCH slots
 * @param slotNumber The current slot number
 * @returns An object where keys are slot numbers and values are committee validator counts
 */
export async function db_getSlotCommitteesValidatorsAmount(slotNumber: number) {
  const slots = await prisma.slot.findMany({
    where: {
      slot: {
        lte: slotNumber,
        gt: slotNumber - env.BEACON_SLOTS_PER_EPOCH * 2,
      },
    },
    select: {
      slot: true,
      committeeValidatorCounts: true,
    },
    orderBy: {
      slot: 'desc',
    },
  });

  return slots.reduce(
    (acc, slot) => {
      acc[slot.slot] = slot.committeeValidatorCounts as number[];
      return acc;
    },
    {} as Record<number, number[]>,
  );
}

export async function updateLastSummaryUpdate<K extends keyof LastSummaryUpdate>(
  key: K,
  value: LastSummaryUpdate[K],
  tx?: Prisma.TransactionClient,
) {
  const client = tx || prisma;

  await client.lastSummaryUpdate.upsert({
    where: { id: 1 },
    update: { [key]: value },
    create: {
      id: 1,
      hourlyValidatorStats: key === 'hourlyValidatorStats' ? (value as Date) : null,
      dailyValidatorStats: key === 'dailyValidatorStats' ? (value as Date) : null,
      weeklyValidatorStats: key === 'weeklyValidatorStats' ? (value as Date) : null,
      monthlyValidatorStats: key === 'monthlyValidatorStats' ? (value as Date) : null,
      yearlyValidatorStats: key === 'yearlyValidatorStats' ? (value as Date) : null,
    },
  });
}

export async function getHighestValidatorId(): Promise<number> {
  const highestValidator = await prisma.validator.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return highestValidator?.id ?? -1;
}

async function fetchValidatorsBatch(skip: number, take: number): Promise<number[]> {
  // Fetch validators with pagination
  const validators = await prisma.validator.findMany({
    where: {
      status: {
        in: [
          VALIDATOR_STATUS.active_ongoing,
          VALIDATOR_STATUS.active_exiting,
          VALIDATOR_STATUS.pending_queued,
        ],
      },
    },
    select: { id: true },
    skip,
    take,
  });

  return validators.map((v) => v.id);
}

// TODO: invalidate cache if we detect a new validator.
export const getActiveValidators = memoizee(
  async function (): Promise<number[]> {
    const batchSize = 200000;
    let allValidators: number[] = [];
    let currentBatch = 0;

    while (true) {
      const validators = await fetchValidatorsBatch(currentBatch * batchSize, batchSize);

      allValidators = [...allValidators, ...validators];

      if (validators.length < batchSize) break;
      currentBatch++;
    }

    return allValidators;
  },
  {
    maxAge: ms(`${env.BEACON_SLOT_DURATION_IN_SECONDS * env.BEACON_SLOTS_PER_EPOCH * 5} seconds`),
  },
);

export async function db_getMaxValidatorId() {
  const res = await prisma.validator.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  return res?.id ?? 0;
}

export async function db_getFinalValidatorIds(): Promise<number[]> {
  const finalStateValidators = await prisma.validator.findMany({
    where: {
      status: {
        in: [
          VALIDATOR_STATUS.exited_unslashed,
          VALIDATOR_STATUS.exited_slashed,
          VALIDATOR_STATUS.withdrawal_done,
        ],
      },
    },
    select: { id: true },
  });

  return finalStateValidators.map((v) => v.id);
}

export async function db_getValidatorsEffectiveBalances(validatorIds: number[]) {
  return prisma.validator.findMany({
    where: {
      id: { in: validatorIds },
    },
    select: { id: true, effectiveBalance: true },
  });
}

export async function db_getValidatorsIdsToFetchInfo(): Promise<number[]> {
  const validators = await prisma.validator.findMany({
    where: {
      OR: [
        {
          status: {
            in: [VALIDATOR_STATUS.active_ongoing, VALIDATOR_STATUS.active_exiting],
          },
        },
        {
          status: null,
        },
      ],
    },
    select: { id: true },
  });

  return validators.map((v) => v.id);
}
