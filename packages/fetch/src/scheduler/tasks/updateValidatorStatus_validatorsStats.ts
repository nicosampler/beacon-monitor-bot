import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler';

import { geSlotsInfo } from '@/src/api/slot.js';
import { env } from '@/src/env.js';
import createLogger, { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { scheduler } from '@/src/lib/scheduler.js';
import { TaskOptions } from '@/src/scheduler/tasks/types.js';

const prisma = getPrisma();

async function updateValidatorStatusTask(logger: CustomLogger) {
  try {
    const { maxSafeSlotToQuery: maxSlotToQuery, syncing } = await geSlotsInfo();

    if (syncing) {
      logger.info('Syncing, skipping validator status update');
      return;
    }

    logger.info('Starting validator status update');

    // Process validator status and attestation data
    await prisma.$executeRaw`
      WITH 
      
      -------------------------------------
      -- Calculate time constants in SQL
      -------------------------------------
      
      constants AS (
        SELECT 
          ${maxSlotToQuery} - (3600 / ${env.BEACON_SLOT_DURATION_IN_SECONDS}) as min_slot,
          ${maxSlotToQuery} as max_slot,
          ${env.BEACON_MAX_ATTESTATION_DELAY} as max_attestation_delay
      ),
      
      -------------------------------------
      -- Get all distinct validators from users
      -------------------------------------
      
      user_validators AS (
        SELECT DISTINCT "B" as validator_id, v.status as validator_status
        FROM "_UserToValidator" uv
        LEFT JOIN "Validator" v ON v.id = uv."B"
      ),
      
      -------------------------------------
      -- Calculate attestations data
      -------------------------------------

      missed_attestations AS (
        SELECT 
          c."validatorIndex",
          c.slot
        FROM "Committee" c
        WHERE c."validatorIndex" IN (SELECT validator_id FROM user_validators)
        AND c.slot BETWEEN (SELECT min_slot FROM constants) AND (SELECT max_slot FROM constants)
        AND (c."attestationDelay" IS NULL OR c."attestationDelay" > (SELECT max_attestation_delay FROM constants))
        AND c."validatorIndex" IN (
          SELECT validator_id FROM user_validators 
          WHERE validator_status IN (2,3) -- active_ongoing, active_exiting
        )
      ),
      
      validator_performance AS (
        SELECT 
          ma."validatorIndex" as validator_id,
          COUNT(*) as one_hour_missed,
          ARRAY_AGG(ma.slot ORDER BY ma.slot DESC) as missed_slots
        FROM missed_attestations ma
        GROUP BY ma."validatorIndex"
      )

      -------------------------------------
      -- Insert or update ValidatorsStats table  
      -------------------------------------
      
      INSERT INTO "ValidatorsStats" (
        "validatorId", 
        "validatorStatus", 
        "oneHourMissed", 
        "lastMissed",
        "timestamp"
      )
      SELECT 
        COALESCE(vp.validator_id, uv.validator_id) as validator_id,
        COALESCE(uv.validator_status, 0) as validator_status,
        COALESCE(vp.one_hour_missed, 0) as one_hour_missed,
        COALESCE(
          CASE 
            WHEN array_length(vp.missed_slots, 1) > 10 
            THEN vp.missed_slots[1:10] 
            ELSE vp.missed_slots 
          END, 
          ARRAY[]::integer[]
        ) as last_missed,
        NOW() as timestamp
      FROM user_validators uv
      LEFT JOIN validator_performance vp ON uv.validator_id = vp.validator_id
      
      ON CONFLICT ("validatorId") 
      DO UPDATE SET
        "validatorStatus" = EXCLUDED."validatorStatus",
        "oneHourMissed" = EXCLUDED."oneHourMissed",
        "lastMissed" = EXCLUDED."lastMissed",
        "timestamp" = EXCLUDED."timestamp"
    `;

    logger.info('Validator status and attestation data updated successfully');
  } catch (error) {
    logger.error('Error updating validator status:', error);
    throw error;
  }
}

export function schedulerUpdateValidatorStatus_validatorsStats({
  id,
  logsEnabled,
  intervalMs,
  runImmediately,
  preventOverrun,
}: TaskOptions) {
  const logger = createLogger(id, logsEnabled);

  const task = new AsyncTask(`${id}_task`, () =>
    updateValidatorStatusTask(logger).catch((e) => {
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
