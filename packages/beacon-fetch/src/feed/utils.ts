import { getPrisma } from "@/src/lib/prisma.js";
import { Prisma, LastSummaryUpdate, PrismaClient } from "@prisma/client";
import { VALIDATOR_STATUS } from "@/src/constants/index.js";

const prisma = getPrisma();

export const db_getLastSlot = async () =>
  await prisma.slot
    .findFirst({ orderBy: { slot: "desc" }, select: { slot: true } })
    .then((d) => d?.slot);

export const db_getLastSlotWithAttestations = async () =>
  await prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
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
  // Use findFirst instead of count
  const res = await prisma.committee.findFirst({
    where: { slot },
  });
  // Return true if a committee is found, false otherwise
  return res !== null;
};

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

// Cache configuration
let validatorsCache: number[] | null = null;

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

// TODO: move to a different file.
export async function getActiveValidators(): Promise<number[]> {
  if (validatorsCache) {
    return validatorsCache;
  }

  const batchSize = 25000;
  let allValidators: number[] = [];
  let currentBatch = 0;

  while (true) {
    const validators = await fetchValidatorsBatch(
      currentBatch * batchSize,
      batchSize
    );

    if (validators.length < batchSize) break;

    allValidators = [...allValidators, ...validators];
    currentBatch++;
  }

  validatorsCache = allValidators;
  return validatorsCache;
}

// Method to manually invalidate cache if needed
export function invalidateValidatorsCache(): void {
  validatorsCache = null;
}
