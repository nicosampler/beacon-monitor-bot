import memoizee from 'memoizee';
import ms from 'ms';

import { getPrisma } from '@/src/config/prisma.js';

const prisma = getPrisma();
const cacheTime = ms('1h');

// Memoized version of getDailyValidatorStats
export const getDailyValidatorStatsMemoized = memoizee(
  async (userId: number) => {
    // Query to get validator stats for the last 24 hours
    const query = `
      WITH combined_stats AS (
        SELECT 
          "validatorIndex",
          date,
          hour,
          head,
          target,
          source,
          inactivity,
          "attestationsMissed",
          "syncCommittee",
          "blockReward"
        FROM "HourlyValidatorStats"
        
        UNION ALL
        
        SELECT 
          "validatorIndex",
          date,
          hour,
          0 as head,
          0 as target,
          0 as source,
          0 as inactivity,
          0 as "attestationsMissed",
          "syncCommittee",
          "blockReward"
        FROM "HourlyBlockAndSyncRewards"
      )
      SELECT 
        COALESCE(SUM(head), 0) as head,
        COALESCE(SUM(target), 0) as target,
        COALESCE(SUM(source), 0) as source,
        COALESCE(SUM(inactivity), 0) as inactivity,
        COALESCE(SUM("attestationsMissed"), 0) as "attestationsMissed",
        COALESCE(SUM("syncCommittee"), 0) as "syncCommittee",
        COALESCE(SUM("blockReward"), 0) as "blockReward"
      FROM combined_stats cs
      JOIN "_UserToValidator" uv ON uv."B" = cs."validatorIndex"
      JOIN "Validator" v ON v.id = uv."B"
      WHERE uv."A" = $1
        AND v.status IN (2, 3)
        AND (
          (cs.date = CURRENT_DATE AND cs.hour <= EXTRACT(HOUR FROM NOW()))
          OR
          (cs.date = CURRENT_DATE - INTERVAL '1 day' AND cs.hour > EXTRACT(HOUR FROM NOW()))
        )`;

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

// Memoized version of getDailyExecutionRewards
export const getDailyExecutionRewardsMemoized = memoizee(
  async (userId: number) => {
    // Query to get execution rewards for the last 24 hours
    const query = `
      SELECT 
        COALESCE(SUM(her.amount), 0) as total
      FROM "HourlyExecutionRewards" her
      JOIN "_FeeRewardAddressToUser" fra ON fra."A" ilike her.address
      WHERE fra."B" = $1
      AND (
          -- Today's records up to current hour
          (her.date = CURRENT_DATE AND her.hour <= EXTRACT(HOUR FROM NOW()))
          OR
          -- Yesterday's records after current hour
          (her.date = CURRENT_DATE - INTERVAL '1 day' AND her.hour > EXTRACT(HOUR FROM NOW()))
      )`;

    return await prisma.$queryRawUnsafe<
      {
        total: string;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: cacheTime },
);
