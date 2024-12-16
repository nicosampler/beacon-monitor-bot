import { getPrisma } from "@/src/lib/prisma.js";
import { Prisma, LastSummaryUpdate } from "@prisma/client";
import { VALIDATOR_STATUS } from "@/src/constants/index.js";
import memoizee from "memoizee";
import ms from "ms";
import { env } from "@/src/env.js";
import { getBlockRewards, getSyncCommitteeRewards } from "@/src/beacon/endpoints.js";

const prisma = getPrisma();

export const db_getLastSlot = async () =>
  await prisma.slot
    .findFirst({ orderBy: { slot: "desc" }, select: { slot: true } })
    .then((d) => d?.slot);

export const db_getLastSlotWithAttestations = async () =>
  await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
    select: { slot: true },
  });

export const db_getLastSlotInCommittee = async () =>
  await prisma.committee.findFirst({
    orderBy: { slot: "desc" },
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

export const db_getLastSlotWithSyncRewards = async () =>
  await prisma.slot.findFirst({
    where: { blockAndSyncRewardsFetched: true },
    orderBy: { slot: "desc" },
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
    distinct: ["slot"],
    orderBy: { slot: "asc" },
  });

  return res[0];
};

export const db_getExistingCommittees = async (
  slotIndex: { slot: number; index: number }[]
) => {
  return prisma.committee
    .count({
      where: {
        AND: slotIndex,
      },
    })
    .then((d) => d > 0);
};

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

export async function updateLastSummaryUpdate<
  K extends keyof LastSummaryUpdate,
>(key: K, value: LastSummaryUpdate[K], tx?: Prisma.TransactionClient) {
  const client = tx || prisma;

  await client.lastSummaryUpdate.upsert({
    where: { id: 1 },
    update: { [key]: value },
    create: {
      id: 1,
      hourlyValidatorStats:
        key === "hourlyValidatorStats" ? (value as Date) : null,
      dailyValidatorStats:
        key === "dailyValidatorStats" ? (value as Date) : null,
      weeklyValidatorStats:
        key === "weeklyValidatorStats" ? (value as Date) : null,
      monthlyValidatorStats:
        key === "monthlyValidatorStats" ? (value as Date) : null,
      yearlyValidatorStats:
        key === "yearlyValidatorStats" ? (value as Date) : null,
    },
  });
}

export async function getHighestValidatorId(): Promise<number> {
  const highestValidator = await prisma.validator.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return highestValidator?.id ?? -1;
}

async function fetchValidatorsBatch(
  skip: number,
  take: number
): Promise<number[]> {
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
      const validators = await fetchValidatorsBatch(
        currentBatch * batchSize,
        batchSize
      );

      allValidators = [...allValidators, ...validators];

      if (validators.length < batchSize) break;
      currentBatch++;
    }

    return allValidators;
  },
  {
    maxAge: ms(
      `${env.BEACON_SLOT_DURATION_IN_SECONDS * env.BEACON_SLOTS_PER_EPOCH * 5} seconds`
    ),
  }
);
