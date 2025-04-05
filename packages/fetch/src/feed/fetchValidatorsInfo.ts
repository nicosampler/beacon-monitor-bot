import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import chunk from 'lodash/chunk.js';

import { getValidatorsInfo } from '@/src/beacon/endpoints.js';
import { VALIDATOR_STATUS } from '@/src/constants/index.js';
import { getHighestValidatorId } from '@/src/feed/utils.js';
import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export async function fetchValidatorsInfo(logger: CustomLogger) {
  logger.info(`Start`);
  try {
    const highestValidatorId = await getHighestValidatorId();

    // Fetch validator IDs that are in final states
    logger.info(`Fetching final state validators`);
    const finalStateValidators = await prisma.validator.findMany({
      where: {
        status: {
          in: [
            VALIDATOR_STATUS.exited_unslashed,
            VALIDATOR_STATUS.exited_slashed,
            VALIDATOR_STATUS.withdrawal_done,
          ],
        },
      },
      select: { id: true },
    });

    // Create array of all validator IDs and filter out those in final states
    // Using a map for faster access
    const finalStateValidatorIds = new Set(finalStateValidators.map((v) => v.id));
    const allValidatorIds = Array.from({ length: highestValidatorId + 1 }, (_, i) => i).filter(
      (id) => !finalStateValidatorIds.has(id),
    );

    // Fetch all validator info in parallel batches
    logger.info(`Call validators info API`);
    const apiValidatorBatches = chunk(allValidatorIds, 6500);
    const allValidatorsInfo: Awaited<ReturnType<typeof getValidatorsInfo>> = [];
    try {
      // Process batches sequentially
      for (const validatorIds of apiValidatorBatches) {
        logger.info(`Processing batch of ${validatorIds.length} validators`);
        const batchResult = await getValidatorsInfo('head', validatorIds);
        allValidatorsInfo.push(...batchResult);
      }
    } catch (error) {
      logger.error(`Error fetching validators info batch`, error);
      return;
    }

    // Database operations in transaction
    try {
      // Insert data in batches with upsert
      logger.info(`Upserting validators info in DB`);
      const insertBatches = chunk(allValidatorsInfo, 5000);
      for (const batch of insertBatches) {
        await prisma.$executeRaw`
              INSERT INTO "Validator" (id, "withdrawalAddress", "status", "balance")
              VALUES ${Prisma.join(
                batch.map(
                  (data) =>
                    Prisma.sql`(${+data.index}, ${
                      data.validator.withdrawal_credentials.startsWith('0x')
                        ? '0x' + data.validator.withdrawal_credentials.slice(-40)
                        : null
                    }, ${VALIDATOR_STATUS[data.status]}, ${new Decimal(data.balance)})`,
                ),
                ', ',
              )}
              ON CONFLICT (id) DO UPDATE SET
                "withdrawalAddress" = EXCLUDED."withdrawalAddress",
                "status" = EXCLUDED."status"
            `;
      }
      logger.info(`Done!`);
    } catch (error) {
      logger.error(`Transaction failed`, error);
    }
  } catch (error) {
    logger.error(`Error fetching validators info`, error);
  }
}
