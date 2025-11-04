import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import chunk from 'lodash/chunk.js';
import ms from 'ms';

import { extractError, beacon_getValidators } from '@/src/beacon/endpoints.js';
import { VALIDATOR_STATUS } from '@/src/constants/index.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { db_getFinalValidatorIds } from '@/src/utils/db.js';

const prisma = getPrisma();

// Function to save validators info to database
async function saveValidatorsToDatabase(
  validatorsInfo: Awaited<ReturnType<typeof beacon_getValidators>>,
  logger: CustomLogger,
  tx?: Prisma.TransactionClient,
) {
  const client = tx || prisma;
  const executeInTransaction = !tx;

  try {
    const saveOperation = async (transactionClient: Prisma.TransactionClient) => {
      // Create temporary table
      await transactionClient.$executeRaw`
        CREATE TEMPORARY TABLE "TempValidator" (LIKE "Validator") ON COMMIT DROP
      `;

      const batches = chunk(validatorsInfo, 6000);
      logger.info(`Processing ${batches.length} batches of validators`);

      for (const batch of batches) {
        await transactionClient.$executeRaw`
          INSERT INTO "TempValidator" (id, "withdrawalAddress", status, balance, "effectiveBalance")
          VALUES ${Prisma.join(
            batch.map(
              (data) =>
                Prisma.sql`(
                  ${+data.index}, 
                  ${
                    data.validator.withdrawal_credentials.startsWith('0x')
                      ? '0x' + data.validator.withdrawal_credentials.slice(-40)
                      : null
                  }, 
                  ${VALIDATOR_STATUS[data.status]}, 
                  ${new Decimal(data.balance)}, 
                  ${new Decimal(data.validator.effective_balance)}
                )`,
            ),
            ', ',
          )}
        `;
      }

      // Merge data from temporary table to main table
      await transactionClient.$executeRaw`
        INSERT INTO "Validator" (id, "withdrawalAddress", status, balance, "effectiveBalance")
        SELECT id, "withdrawalAddress", status, balance, "effectiveBalance"
        FROM "TempValidator"
        ON CONFLICT (id) DO UPDATE SET
          "withdrawalAddress" = EXCLUDED."withdrawalAddress",
          "status" = EXCLUDED.status,
          "effectiveBalance" = EXCLUDED."effectiveBalance"
      `;
    };

    if (executeInTransaction) {
      await prisma.$transaction(saveOperation, {
        timeout: ms('2m'),
      });
    } else {
      await saveOperation(client as Prisma.TransactionClient);
    }

    logger.info(`Successfully saved ${validatorsInfo.length} validators to database`);
  } catch (error) {
    logger.error(`Error saving validators to database`, error);
    throw error;
  }
}

/**
 * This function fetches all validators from the beacon chain at a particular slot.
 * It is used to bring new validators to the database. and also update their statuses.
 */
export async function fetchValidators(
  logger: CustomLogger,
  epochToFetch: number,
  stateId: number | 'head',
  finalValidatorIds?: number[],
  maxValidatorId: number = 0,
) {
  const start = Date.now();
  logger.info(`Fetching validators.`);
  try {
    const batchSize = 1_000_000;
    const totalValidators = finalValidatorIds ? maxValidatorId + 10_000 : 4_000_000;

    // Get final state validators (provided or fetch from DB)
    let finalStateValidatorsIds: number[];
    if (finalValidatorIds) {
      finalStateValidatorsIds = finalValidatorIds;
    } else {
      // Fallback: fetch from database (for backward compatibility)
      finalStateValidatorsIds = await db_getFinalValidatorIds();
    }

    const finalStateValidatorsSet = new Set(finalStateValidatorsIds);

    // Generate all validator IDs from 0 to totalValidators, excluding final state validators
    const allValidatorIds = Array.from({ length: totalValidators }, (_, i) => i).filter(
      (id) => !finalStateValidatorsSet.has(id),
    );

    // Create chunks of batchSize
    const batches = chunk(allValidatorIds, batchSize);
    let allValidatorsData: Awaited<ReturnType<typeof beacon_getValidators>> = [];
    for (const batchIds of batches) {
      try {
        const batchResult = await beacon_getValidators(
          stateId,
          batchIds.map((id) => String(id)),
          null,
        );

        allValidatorsData = [...allValidatorsData, ...batchResult];

        if (batchResult.length < batchSize) {
          break;
        }
      } catch (error) {
        logger.error(`Error processing batch`, extractError(error));
      }
    }

    logger.info(
      `All validators fetched in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );

    await prisma.$transaction(async (tx) => {
      await saveValidatorsToDatabase(allValidatorsData, logger, tx);
      await tx.epoch.update({
        where: { epoch: epochToFetch },
        data: { validatorsInfoFetched: true },
      });
    });
  } catch (error) {
    logger.error(`Error fetching validators info`, error);
    throw error;
  }
}
