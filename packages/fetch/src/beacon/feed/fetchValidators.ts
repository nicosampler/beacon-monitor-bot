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
) {
  try {
    await prisma.$transaction(
      async (tx) => {
        // Create temporary table
        await tx.$executeRaw`
        CREATE TEMPORARY TABLE "TempValidator" (LIKE "Validator") ON COMMIT DROP
      `;

        const batches = chunk(validatorsInfo, 6000);
        logger.info(`Processing ${batches.length} batches of validators`);

        for (const batch of batches) {
          await tx.$executeRaw`
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
        await tx.$executeRaw`
        INSERT INTO "Validator" (id, "withdrawalAddress", status, balance, "effectiveBalance")
        SELECT id, "withdrawalAddress", status, balance, "effectiveBalance"
        FROM "TempValidator"
        ON CONFLICT (id) DO UPDATE SET
          "withdrawalAddress" = EXCLUDED."withdrawalAddress",
          "status" = EXCLUDED.status,
          "effectiveBalance" = EXCLUDED."effectiveBalance"
      `;
      },
      {
        timeout: ms('2m'),
      },
    );

    logger.info(`Successfully saved ${validatorsInfo.length} validators to database`);
  } catch (error) {
    logger.error(`Error saving validators to database`, error);
    throw error;
  }
}

/*
  This function fetches all validators from the beacon chain at a particular slot.
  It first gets the final state validators from the database.
  Then it generates all validator IDs and filters out the final state validators.
  Then it creates chunks of batchSize and fetches the validators from the beacon chain.
  Then it saves the validators to the database.
 */
export async function fetchValidators(logger: CustomLogger, stateId: number | 'head') {
  // TODO:
  // tiene sentido hacer fetch de todos los validadores?
  // podemos observar los nuevos/slasheados en otro proceso y aca siempre pedir del max validator id en adelante.

  const start = Date.now();
  logger.info(`Fetching validators.`);
  try {
    const batchSize = 1_000_000;
    const totalValidators = 3_000_000;

    // Get final state validators
    const finalStateValidatorsIds = await db_getFinalValidatorIds();
    const finalStateValidatorsSet = new Set(finalStateValidatorsIds); // why we need this?

    // Generate all validator IDs and filter out final state validators
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

    // Save all collected data to database
    await saveValidatorsToDatabase(allValidatorsData, logger);
  } catch (error) {
    logger.error(`Error fetching validators info`, error);
  }
}
