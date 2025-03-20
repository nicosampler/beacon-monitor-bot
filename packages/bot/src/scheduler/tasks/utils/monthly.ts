import memoizee from 'memoizee';
import ms from 'ms';

import { getPrisma } from '@/src/config/prisma.js';

const prisma = getPrisma();

export const getMonthlyValidatorStatsMemoized = memoizee(
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
        AND dvs.date > ld.max_date - INTERVAL '1 month'`;

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
  { promise: true, maxAge: ms('1h') },
);

export const getMonthlyExecutionRewardsMemoized = memoizee(
  async (userId: number) => {
    const query = `
      WITH last_date AS (
        SELECT MAX(date) as max_date
        FROM "DailyExecutionRewards"
      )
      SELECT 
        COALESCE(SUM(der.amount), 0) as total
      FROM "DailyExecutionRewards" der
      JOIN "_FeeRewardAddressToUser" fra ON fra."A" ilike der.address
      CROSS JOIN last_date ld
      WHERE fra."B" = $1
        AND der.date <= ld.max_date
        AND der.date > ld.max_date - INTERVAL '1 month'`;

    return await prisma.$queryRawUnsafe<
      {
        total: string;
      }[]
    >(query, userId);
  },
  { promise: true, maxAge: ms('1h') },
);
