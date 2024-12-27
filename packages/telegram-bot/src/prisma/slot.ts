import { getPrisma } from "@/src/config/prisma.js";
import { AppError } from "@/src/utils/errors/AppError.js";

const prisma = getPrisma();

export function getSlot_db(slot: number) {
  return prisma.slot.findUniqueOrThrow({ where: { slot } });
}

export function getLastSlotWithAttestations_db() {
  return prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
  });
}
