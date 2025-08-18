import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { beacon_getValidatorsBalances } from '@/src/beacon/endpoints.js';
import { db_getFinalValidatorIds, db_getMaxValidatorId } from '@/src/utils/db.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { getEpochFromSlot } from '@/src/beacon/utils/misc.js';

const prisma = getPrisma();

// Function to save validator balances to database
async function saveValidatorBalancesToDatabase(
  validatorBalances: Array<{ index: string; balance: string }>,
  slot: number,
  logger: CustomLogger,
) {
  logger.info('Saving result to db.');
  try {
    await prisma.$transaction(
      async (tx) => {
        // Create temporary table
        await tx.$executeRaw`
        CREATE TEMPORARY TABLE "TempValidator" (LIKE "Validator") ON COMMIT DROP
      `;

        const batches = chunk(validatorBalances, 12_000);
        for (const batch of batches) {
          await tx.$executeRaw`
          INSERT INTO "TempValidator" (id, balance)
          VALUES ${Prisma.join(
            batch.map(
              (data) =>
                Prisma.sql`(
                  ${parseInt(data.index)}, 
                  ${new Decimal(data.balance)}
                )`,
            ),
            ', ',
          )}
        `;
        }

        // Merge data from temporary table to main table
        await tx.$executeRaw`
          INSERT INTO "Validator" (id, balance)
          SELECT id, balance
          FROM "TempValidator"
          ON CONFLICT (id) DO UPDATE SET
            "balance" = EXCLUDED.balance
        `;

        // Update the epoch to mark balances as fetched
        await tx.epoch.update({
          where: { epoch: getEpochFromSlot(slot) },
          data: { validatorsBalancesFetched: true },
        });
      },
      {
        timeout: ms('1m'),
      },
    );

    logger.info(`Successfully saved ${validatorBalances.length} validator balances to database`);
  } catch (error) {
    logger.error(`Error saving validator balances to database`, error);
    throw error;
  }
}

export async function fetchValidatorsBalances(logger: CustomLogger, slot: number) {
  const start = Date.now();
  logger.info(`Fetching validators balances.`);
  try {
    const totalValidators = await db_getMaxValidatorId();
    if (totalValidators == 0) {
      logger.info('No validators ids to fetch');
      return;
    }

    const batchSize = 1_000_000;

    // Get final state validators
    const finalStateValidatorsIds = await db_getFinalValidatorIds();
    const finalStateValidatorsSet = new Set(finalStateValidatorsIds);

    // Generate all validator IDs and filter out final state validators
    const allValidatorIds = Array.from({ length: totalValidators }, (_, i) => i).filter(
      (id) => !finalStateValidatorsSet.has(id),
    );

    // Create chunks of batchSize
    const batches = chunk(allValidatorIds, batchSize);
    let allValidatorBalances: Awaited<ReturnType<typeof beacon_getValidatorsBalances>> = [];

    for (const batchIds of batches) {
      try {
        const batchResult = await beacon_getValidatorsBalances(
          slot,
          batchIds.map((id) => String(id)),
        );

        allValidatorBalances = [...allValidatorBalances, ...batchResult];

        if (batchResult.length < batchSize) {
          break;
        }
      } catch (error) {
        logger.error(`Error processing batch`, error);
      }
    }

    logger.info(
      `All validator balances fetched in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );

    // Save all collected data to database
    await saveValidatorBalancesToDatabase(allValidatorBalances, slot, logger);
  } catch (error) {
    logger.error(`Error fetching validator balances info`, error);
  }
}
