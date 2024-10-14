import { getPrisma } from "@/src/lib/prisma.js";
import { Prisma, LastSummaryUpdate, PrismaClient } from "@prisma/client";

const prisma = getPrisma();

export const db_getLastSlot = async () =>
  await prisma.slot
    .findFirst({ orderBy: { slot: "desc" }, select: { slot: true } })
    .then((d) => d?.slot);

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
  const res = await prisma.committee.count({ where: { slot } });
  return res > 0;
};

export const db_getSlotByNumbers = async (slots: number[]) => {
  const res = await prisma.slot.findMany({
    where: { slot: { in: slots } },
  });
  return res.map((r) => r.slot);
};

export const db_getUniqueSlotsFromCommittees = async (slots: number[]) => {
  const res = await prisma.committee.findMany({
    where: { slot: { in: slots } },
    distinct: ["slot"],
    select: { slot: true },
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

export async function updateLastSummaryUpdate<K extends keyof LastSummaryUpdate>(
  key: K,
  value: LastSummaryUpdate[K],
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma;
  
  await client.lastSummaryUpdate.upsert({
    where: { id: 1 },
    update: { [key]: value },
    create: {
      id: 1,
      hourlyValidatorStats: key === 'hourlyValidatorStats' ? value as Date : new Date(0),
      dailyValidatorStats: key === 'dailyValidatorStats' ? value as Date : new Date(0),
      weeklyValidatorStats: key === 'weeklyValidatorStats' ? value as Date : new Date(0),
      monthlyValidatorStats: key === 'monthlyValidatorStats' ? value as Date : new Date(0),
      yearlyValidatorStats: key === 'yearlyValidatorStats' ? value as Date : new Date(0),
    },
  });
}
