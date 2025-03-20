import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { getValidatorsBalances } from '@/src/beacon/endpoints.js';
import { getSlotNumberFromTimestamp } from '@/src/beacon/utils/time.js';
import { env } from '@/src/env.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

function logValidatorBalances(
  logger: CustomLogger,
  validatorCount: number,
  updateCount: number,
  insertCount: number,
): void {
  logger.info(
    `Processed ${validatorCount} validators (${updateCount} updates, ${insertCount} inserts)`,
  );
}

/*
 * We fetch the highest validator ID from the database to determine which validators
 * need to be updated vs. inserted. This approach is based on two key assumptions:
 * 1. New validators are always added with incrementing IDs.
 * 2. The getValidatorsBalances function returns results ordered by validator index.
 *
 * By comparing each validator's index to the highest ID in our database:
 * - Validators with index <= highestValidatorId are existing and need updates.
 * - Validators with index > highestValidatorId are new and need to be inserted.
 *
 * We use raw SQL queries for both updates and inserts to maximize efficiency.
 * Each operation (update or insert) is performed in a single transaction with up to 5000 records.
 */
export const fetchValidatorsBalances = async (logger: CustomLogger): Promise<void> => {
  const slotNumber = getSlotNumberFromTimestamp(Date.now()) - env.BEACON_SLOTS_PER_EPOCH;
  try {
    logger.info(`Fetching for state ${slotNumber}`);
    const validatorBalances = await getValidatorsBalances(slotNumber);

    logger.info(`Processing ${validatorBalances.length} validator balances`);

    const batchSize = 5000;
    let processedCount = 0;

    // Process all validators in batches
    for (let i = 0; i < validatorBalances.length; i += batchSize) {
      const batch = validatorBalances.slice(i, i + batchSize);
      const upsertQuery = Prisma.sql`
        INSERT INTO "Validator" ("id", "balance")
        VALUES ${Prisma.join(
          batch.map((v) => Prisma.sql`(${parseInt(v.index)}, ${new Decimal(v.balance)})`),
        )}
        ON CONFLICT ("id") DO UPDATE
        SET "balance" = EXCLUDED.balance;
      `;

      const result = await prisma.$executeRaw(upsertQuery);
      processedCount += result;
    }

    logValidatorBalances(
      logger,
      validatorBalances.length,
      processedCount,
      validatorBalances.length - processedCount,
    );
  } catch (error) {
    logger.error(`Error in fetchValidatorsBalances for state ${slotNumber}`, error);
    throw error;
  }
};
