import { getPrisma } from "@/src/lib/prisma.js";
import { PrismaClient } from "@prisma/client";

export function getLastSlotWithAttestations_db() {
  const prisma = getPrisma();

  return prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: "desc" },
  });
}
