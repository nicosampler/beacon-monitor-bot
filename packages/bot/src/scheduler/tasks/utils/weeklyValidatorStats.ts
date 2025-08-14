import memoizee from 'memoizee';
import ms from 'ms';

import { getPrisma } from '@/src/config/prisma.js';

const prisma = getPrisma();
const cacheTime = ms('12h');

// Memoized version of getWeeklyValidatorStats
export const getWeeklyValidatorStatsMemoized = memoizee(
  async (userId: number) => {
    const query = `
      WITH last_date AS (
        SELECT MAX(date) as max_date
        FROM "DailyValidatorStats"
      )
      SELECT 
        COALESCE(SUM(head), 0) as head,
        COALESCE(SUM(target), 0) as target,
        COALESCE(SUM(source), 0) as source,
        COALESCE(SUM(inactivity), 0) as inactivity,
        COALESCE(SUM("attestationsMissed"), 0) as "attestationsMissed",
        COALESCE(SUM("syncCommittee"), 0) as "syncCommittee",
        COALESCE(SUM("blockReward"), 0) as "blockReward"
      FROM "DailyValidatorStats" dvs
      JOIN "_UserToValidator" uv ON uv."B" = dvs."validatorIndex"
      JOIN "Validator" v ON v.id = uv."B"
      CROSS JOIN last_date ld
      WHERE uv."A" = $1
        AND v.status IN (2, 3)
        AND dvs.date <= ld.max_date
        AND dvs.date > ld.max_date - INTERVAL '7 days'`;

    return await prisma.$queryRawUnsafe<
      {
        head: string;
        target: string;
        source: string;
        inactivity: string;
        syncCommittee: string;
        blockReward: string;
        attestationsMissed: bigint;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: cacheTime },
);

// Memoized version of getWeeklyExecutionRewards
export const getWeeklyExecutionRewardsMemoized = memoizee(
  async (userId: number) => {
    const query = `
      SELECT 
        COALESCE(SUM(her.amount), 0) as total
      FROM "ExecutionRewards" her
      JOIN "_FeeRewardAddressToUser" fra ON fra."A" ilike her.address
      WHERE fra."B" = $1
        AND her.timestamp >= NOW() - INTERVAL '7 days'`;

    return await prisma.$queryRawUnsafe<
      {
        total: string;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: cacheTime },
);
