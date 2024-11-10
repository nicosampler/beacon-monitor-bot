import { getPrisma } from "@/src/lib/prisma.js";
import { CustomLogger } from "@/src/lib/pino.js";

const prisma = getPrisma();

export async function maintainCommittee(logger: CustomLogger) {
  try {
    logger.info("Starting Committee table maintenance");

    logger.info("Running VACUUM on Committee table");
    await prisma.$executeRaw`VACUUM full "Committee"`;

    logger.info("Running REINDEX on Committee table");
    await prisma.$executeRaw`REINDEX TABLE "Committee"`;

    logger.info("Update PSQL stats on Committee table");
    await prisma.$executeRaw`ANALYZE "Committee"`;

    logger.info("Committee table maintenance completed");
  } catch (error) {
    logger.error("Error during Committee table maintenance:", error);
    throw error;
  }
}
