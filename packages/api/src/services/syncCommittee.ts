import { getPrisma } from '@/src/lib/prisma.js';
import { getEpochNumberFromTimestamp } from '@/src/utils/beacon.js';

export async function getCurrentSyncCommittee() {
  const prisma = getPrisma();
  const currentTimestamp = Date.now();
  const currentEpoch = getEpochNumberFromTimestamp(currentTimestamp);

  // Find the sync committee that includes the current epoch
  const syncCommittee = await prisma.syncCommittee.findFirst({
    where: {
      fromEpoch: {
        lte: currentEpoch,
      },
      toEpoch: {
        gte: currentEpoch,
      },
    },
  });

  if (!syncCommittee) {
    throw new Error('No sync committee found for current epoch');
  }

  return {
    fromEpoch: syncCommittee.fromEpoch,
    toEpoch: syncCommittee.toEpoch,
    validators: syncCommittee.validators as string[],
    validatorAggregates: syncCommittee.validatorAggregates as string[][],
    notified: syncCommittee.notified,
  };
}

export async function updateSyncCommitteeNotified(fromEpoch: number, toEpoch: number) {
  const prisma = getPrisma();

  const result = await prisma.syncCommittee.update({
    where: {
      fromEpoch_toEpoch: {
        fromEpoch,
        toEpoch,
      },
    },
    data: {
      notified: true,
    },
  });

  return result;
}
