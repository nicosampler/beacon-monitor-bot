import ms from "ms";
import { Prisma } from "@prisma/client";
import { getValidatorsInfo } from "@/src/beacon/endpoints.js";
import createLogger, { CustomLogger } from "@/src/lib/pino.js";
import { getHighestValidatorId } from "@/src/feed/utils.js";
import chunk from "lodash/chunk.js";
import { getSlotNumberFromTimestamp } from "@/src/beacon/utils/time.js";
import { env } from "@/src/env.js";
import { VALIDATOR_STATUS } from "@/src/constants/index.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = getPrisma();

export async function fetchValidatorsInfo(logger: CustomLogger) {
  logger.info(`Start`);
  try {
    const highestValidatorId = await getHighestValidatorId();
    const apiBatchSize = 6500; // Batch size for API calls
    const dbBatchSize = 8000; // Batch size for DB updates

    // Fetch validator IDs that are in final states
    logger.info(`Fetching final state validators`);
    const finalStateValidators = await prisma.validator.findMany({
      where: {
        status: {
          in: [
            VALIDATOR_STATUS.EXITED_UNSLASHED,
            VALIDATOR_STATUS.EXITED_SLASHED,
            VALIDATOR_STATUS.WITHDRAWAL_DONE,
          ],
        },
      },
      select: { id: true },
    });

    // Create array of all validator IDs and filter out those in final states
    // Using a map for faster access
    const finalStateValidatorIds = new Set(
      finalStateValidators.map((v) => v.id)
    );
    const allValidatorIds = Array.from(
      { length: highestValidatorId + 1 },
      (_, i) => i
    ).filter((id) => !finalStateValidatorIds.has(id));

    // First loop: Fetch all validator info in parallel batches
    logger.info(`Call validators info API`);
    const apiValidatorBatches = chunk(allValidatorIds, apiBatchSize);
    const allValidatorsInfo: Awaited<ReturnType<typeof getValidatorsInfo>> = [];
    try {
      const validatorPromises = apiValidatorBatches.map((validatorIds) =>
        getValidatorsInfo("head", validatorIds)
      );

      const results = await Promise.all(validatorPromises);
      results.forEach((batch) => allValidatorsInfo.push(...batch));
    } catch (error) {
      logger.error(`Error fetching validators info batch`, error);
      return;
    }

    // Database operations in transaction
    try {
      // Insert data in batches with upsert
      logger.info(`Upserting validators info in DB`);
      const insertBatches = chunk(allValidatorsInfo, dbBatchSize);
      for (const batch of insertBatches) {
        await prisma.$executeRaw`
              INSERT INTO "Validator" (id, "withdrawalAddress", "status", "balance")
              VALUES ${Prisma.join(
                batch.map(
                  (data) =>
                    Prisma.sql`(${+data.index}, ${
                      data.validator.withdrawal_credentials.startsWith("0x")
                        ? "0x" +
                          data.validator.withdrawal_credentials.slice(-40)
                        : null
                    }, ${data.status}, ${new Decimal(data.balance)})`
                ),
                ", "
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
