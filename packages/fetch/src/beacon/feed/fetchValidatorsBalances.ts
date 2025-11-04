import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { beacon_getValidatorsBalances } from '@/src/beacon/endpoints.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

// Function to save validator balances to database
async function saveValidatorBalancesToDatabase(
  epochToFetch: number,
  validatorBalances: Array<{ index: string; balance: string }>,
  logger: CustomLogger,
) {
  const prisma = getPrisma();
  logger.info('Saving result to db.');

  try {
    const saveOperation = async (tx: Prisma.TransactionClient) => {
      // Create temporary table
      await tx.$executeRaw`
        CREATE TEMPORARY TABLE "TempValidator" (LIKE "Validator") ON COMMIT DROP
      `;

      const batches = chunk(validatorBalances, 20_000);
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

      await tx.epoch.update({
        where: { epoch: epochToFetch },
        data: { validatorsBalancesFetched: true },
      });
    };

    await prisma.$transaction(saveOperation, { timeout: ms('1m') });

    logger.info(`Successfully saved ${validatorBalances.length} validator balances to database`);
  } catch (error) {
    logger.error(`Error saving validator balances to database`, error);
    throw error;
  }
}

export async function fetchValidatorsBalances(
  logger: CustomLogger,
  epoch: number,
  slot: number,
  activeValidatorIds?: number[],
) {
  const start = Date.now();
  logger.info(`Fetching validators balances.`);

  try {
    const batchSize = 1_000_000;
    const batchPromises = chunk(activeValidatorIds, batchSize).map(async (batchIds) =>
      beacon_getValidatorsBalances(
        slot,
        batchIds.map((id) => String(id)),
      ),
    );

    const batchResults = await Promise.all(batchPromises);
    const allValidatorBalances = batchResults.flat();

    logger.info(
      `All validator balances fetched in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );

    await saveValidatorBalancesToDatabase(epoch, allValidatorBalances, logger);
  } catch (error) {
    logger.error(`Error fetching validator balances info`, error);
    throw error;
  }
}
