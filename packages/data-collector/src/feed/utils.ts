import { getPrisma } from "@/src/lib/prisma.js";

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
    select: { slot: true, attestationsFetched: true, commitee: true },
  });

export const db_existCommitteeForSlot = async (slot: number) => {
  const res = await prisma.committee.count({ where: { slot } });
  return res > 0;
};

export const db_AttestationsBySlots = async (slots: number[]) =>
  prisma.attestations.findMany({
    where: { slot: { in: slots } },
  });

export const db_getAttestationsBySlots = async (slots: number[]) =>
  prisma.attestations.findMany({
    where: { slot: { in: slots } },
    distinct: ["slot"],
  });

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
) =>
  prisma.committee.findMany({
    where: {
      AND: slotIndex,
    },
    select: {
      slot: true,
      index: true,
    },
  });

export const db_getLastUnprocessedEpoch = async () => {
  return prisma.epoch.findFirst({
    where: { processed: false },
    orderBy: { epoch: "asc" },
  });
};

export const db_getUnprocessedSlots = async ({
  minSlot,
  maxSlot,
  orderConfig,
}: {
  minSlot: number;
  maxSlot: number;
  orderConfig: {
    direction: "first" | "last";
    limit: number;
  };
}) => {
  const isLast = orderConfig.direction === "last";

  const res = await prisma.slot.findMany({
    select: { slot: true },
    where: { attestationsFetched: false, slot: { gte: minSlot, lte: maxSlot } },
    orderBy: { slot: isLast ? "desc" : "asc" },
    take: orderConfig.limit,
  });

  // If 'last' was specified, reverse the array to maintain ascending order
  return isLast ? res.reverse().map((r) => r.slot) : res.map((r) => r.slot);
};
