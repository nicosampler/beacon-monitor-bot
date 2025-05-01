import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export function getLastSlotWithAttestations_db() {
  return prisma.slot.findFirst({
    where: { attestationsFetched: true },
    orderBy: { slot: 'desc' },
  });
}
