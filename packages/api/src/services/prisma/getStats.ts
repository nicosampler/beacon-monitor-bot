import { getPrisma } from '@/src/lib/prisma.js';

export type StatsResponse = {
  epochs: {
    maxEpoch: number;
    maxEpochWithRewardsFetched: number;
  };
  slots: {
    maxSlot: number;
    maxSlotWithAttestationFetched: number;
    maxSlotWithBlockAndSyncRewards: number;
  };
  lastSummaryUpdate: {
    hourly: Date | null;
    daily: Date | null;
  };
};

export async function getStats(): Promise<StatsResponse> {
  const prisma = getPrisma();

  // Get max epoch and max epoch with rewards fetched
  const [maxEpochResult, maxEpochWithRewardsResult] = await Promise.all([
    prisma.epoch.findFirst({
      orderBy: {
        epoch: 'desc',
      },
      select: {
        epoch: true,
      },
    }),
    prisma.epoch.findFirst({
      where: {
        rewardsFetched: true,
      },
      orderBy: {
        epoch: 'desc',
      },
      select: {
        epoch: true,
      },
    }),
  ]);

  // Get max slot and slots with different data fetched
  const [maxSlotResult, maxSlotWithAttestationResult, maxSlotWithRewardsResult] = await Promise.all(
    [
      prisma.slot.findFirst({
        orderBy: {
          slot: 'desc',
        },
        select: {
          slot: true,
        },
      }),
      prisma.slot.findFirst({
        where: {
          attestationsFetched: true,
        },
        orderBy: {
          slot: 'desc',
        },
        select: {
          slot: true,
        },
      }),
      prisma.slot.findFirst({
        where: {
          blockAndSyncRewardsFetched: true,
        },
        orderBy: {
          slot: 'desc',
        },
        select: {
          slot: true,
        },
      }),
    ],
  );

  // Get last summary update dates
  const lastSummaryUpdate = await prisma.lastSummaryUpdate.findFirst();

  return {
    epochs: {
      maxEpoch: maxEpochResult?.epoch ?? 0,
      maxEpochWithRewardsFetched: maxEpochWithRewardsResult?.epoch ?? 0,
    },
    slots: {
      maxSlot: maxSlotResult?.slot ?? 0,
      maxSlotWithAttestationFetched: maxSlotWithAttestationResult?.slot ?? 0,
      maxSlotWithBlockAndSyncRewards: maxSlotWithRewardsResult?.slot ?? 0,
    },
    lastSummaryUpdate: {
      hourly: lastSummaryUpdate?.hourlyValidatorStats ?? null,
      daily: lastSummaryUpdate?.dailyValidatorStats ?? null,
    },
  };
}
