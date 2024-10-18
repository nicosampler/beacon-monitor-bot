import { getValidatorsBalances } from "@/src/beacon/endpoints.js";
import { getPrisma } from "@/src/lib/prisma.js";
import createLogger from "@/src/lib/pino.js";
import { CustomLogger } from "@/src/lib/pino.js";
import { Decimal } from "@prisma/client/runtime/library";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import { Prisma } from "@prisma/client";
import { getHighestValidatorId } from "@/src/feed/utils.js";

const prisma = getPrisma();

function logValidatorBalances(
  logger: CustomLogger,
  validatorCount: number,
  updateCount: number,
  insertCount: number
): void {
  logger.info(
    `Processed ${validatorCount} validators (${updateCount} updates, ${insertCount} inserts)`
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
export const fetchValidatorsBalances = async (): Promise<void> => {
  const logger = createLogger(`FetchValidatorsBalances`);
  const slotNumber =
    getSlotNumberFromTimestamp(Date.now()) - env.BEACON_SLOTS_PER_EPOCH;
  try {
    logger.info(`Fetching for state ${slotNumber}`);
    const validatorBalances = await getValidatorsBalances(slotNumber);

    logger.info(`Processing ${validatorBalances.length} validator balances`);

    // Get the highest validator index from the database
    const highestValidatorId = await getHighestValidatorId();

    const batchSize = 5000;
    let updateCount = 0;
    let insertCount = 0;

    // Process updates
    const updateBatch = validatorBalances.filter(
      (v) => parseInt(v.index) <= highestValidatorId
    );
    for (let i = 0; i < updateBatch.length; i += batchSize) {
      const batch = updateBatch.slice(i, i + batchSize);
      const updateQuery = Prisma.sql`
        UPDATE "Validator"
        SET "balance" = CASE
          ${Prisma.join(
            batch.map(
              (v) =>
                Prisma.sql`WHEN "id" = ${parseInt(v.index)} THEN ${new Decimal(v.balance)}`
            ),
            " "
          )}
        END
        WHERE "id" IN (${Prisma.join(batch.map((v) => parseInt(v.index)))});
      `;

      const result = await prisma.$executeRaw(updateQuery);
      updateCount += result;
    }

    // Process inserts
    const insertBatch = validatorBalances.filter(
      (v) => parseInt(v.index) > highestValidatorId
    );
    for (let i = 0; i < insertBatch.length; i += batchSize) {
      const batch = insertBatch.slice(i, i + batchSize);
      const insertQuery = Prisma.sql`
        INSERT INTO "Validator" ("id", "balance")
        VALUES ${Prisma.join(
          batch.map(
            (v) => Prisma.sql`(${parseInt(v.index)}, ${new Decimal(v.balance)})`
          )
        )}
        ON CONFLICT ("id") DO NOTHING;
      `;

      const result = await prisma.$executeRaw(insertQuery);
      insertCount += result;
    }

    logValidatorBalances(
      logger,
      validatorBalances.length,
      updateCount,
      insertCount
    );
  } catch (error) {
    logger.error(`Error in fetchValidatorsBalances for state ${slotNumber}`, {
      error,
    });
    throw error;
  }
};
