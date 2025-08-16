import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

async function updateDailyRewardsTask(logger: CustomLogger) {
  try {
    logger.info('Starting daily rewards update');

    // Update daily CL and EL rewards for all validators in ValidatorsStats
    await prisma.$executeRaw`
      WITH 
      
      -------------------------------------
      -- Calculate daily CL rewards from HourlyValidatorStats (attestation rewards only)
      -------------------------------------

      cl_attestation_rewards AS (
        SELECT 
          "validatorIndex",
          COALESCE(SUM(CAST(head AS BIGINT)), 0) + 
          COALESCE(SUM(CAST(target AS BIGINT)), 0) + 
          COALESCE(SUM(CAST(source AS BIGINT)), 0) + 
          COALESCE(SUM(CAST(inactivity AS BIGINT)), 0) as daily_cl_rewards
        FROM "HourlyValidatorStats"
        WHERE (
          (date = CURRENT_DATE AND hour <= EXTRACT(HOUR FROM NOW()))
          OR
          (date = CURRENT_DATE - INTERVAL '1 day' AND hour > EXTRACT(HOUR FROM NOW()))
        )
        GROUP BY "validatorIndex"
      ),

      -------------------------------------
      -- Calculate daily CL rewards from HourlyBlockAndSyncRewards
      -------------------------------------

      cl_block_and_sync_rewards AS (
        SELECT 
          "validatorIndex",
          COALESCE(SUM(CAST("syncCommittee" AS BIGINT)), 0) +
          COALESCE(SUM(CAST("blockReward" AS BIGINT)), 0) as daily_cl_rewards
        FROM "HourlyBlockAndSyncRewards"
        WHERE (
          (date = CURRENT_DATE AND hour <= EXTRACT(HOUR FROM NOW()))
          OR
          (date = CURRENT_DATE - INTERVAL '1 day' AND hour > EXTRACT(HOUR FROM NOW()))
        )
        GROUP BY "validatorIndex"
      ),

      -------------------------------------
      -- Combine CL rewards from both HourlyValidatorStats & HourlyBlockAndSyncRewards
      -------------------------------------

      cl_rewards_combined AS (
        SELECT 
          COALESCE(att."validatorIndex", bas."validatorIndex") as "validatorIndex",
          COALESCE(att.daily_cl_rewards, 0) + COALESCE(bas.daily_cl_rewards, 0) as daily_cl_rewards
        FROM cl_attestation_rewards att
        FULL OUTER JOIN cl_block_and_sync_rewards bas ON att."validatorIndex" = bas."validatorIndex"
      ),

      -------------------------------------
      -- Calculate daily EL rewards
      -------------------------------------

      el_rewards AS (
        SELECT 
          uv."B" as validator_id,
          COALESCE(SUM(CAST(er.amount AS BIGINT)), 0) as daily_el_rewards
        FROM "_UserToValidator" uv
        JOIN "_FeeRewardAddressToUser" fra ON fra."B" = uv."A"
        JOIN "ExecutionRewards" er ON LOWER(er.address) = LOWER(fra."A")
        WHERE er.timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY uv."B"
      )

      -------------------------------------
      -- Insert or update ValidatorsStats table with daily rewards
      -------------------------------------
      
      INSERT INTO "ValidatorsStats" ("validatorId", "dailyCLRewards", "dailyELRewards", "timestamp")
      SELECT 
        cl."validatorIndex",
        cl.daily_cl_rewards,
        COALESCE(el.daily_el_rewards, 0),
        NOW()
      FROM cl_rewards_combined cl
      LEFT JOIN el_rewards el ON el.validator_id = cl."validatorIndex"
      ON CONFLICT ("validatorId") 
      DO UPDATE SET
        "dailyCLRewards" = EXCLUDED."dailyCLRewards",
        "dailyELRewards" = EXCLUDED."dailyELRewards",
        "timestamp" = EXCLUDED."timestamp"
    `;

    logger.info('Daily rewards updated successfully');
  } catch (error) {
    logger.error('Error updating daily rewards:', error);
    throw error;
  }
}

export function schedulerUpdateDailyRewards_validatorsStats({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () =>
    updateDailyRewardsTask(logger).catch((e) => {
      logger.error('TASK-CATCH', e);
    }),
  );

  const job = new SimpleIntervalJob(
    { milliseconds: intervalMs, runImmediately: runImmediately },
    task,
    {
      id: id,
      preventOverrun: preventOverrun,
    },
  );

  scheduler.addSimpleIntervalJob(job);
}
