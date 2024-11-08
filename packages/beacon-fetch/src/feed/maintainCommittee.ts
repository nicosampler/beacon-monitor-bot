import { getPrisma } from "@/src/lib/prisma.js";
import { CustomLogger } from "@/src/lib/pino.js";

const prisma = getPrisma();

export async function maintainCommittee(logger: CustomLogger) {
  try {
    logger.info("Starting Committee table maintenance");
    
    // Run VACUUM first
    logger.info("Running VACUUM on Committee table");
    await prisma.$executeRaw`VACUUM "Committee"`;
    
    // Then REINDEX
    logger.info("Running REINDEX on Committee table");
    await prisma.$executeRaw`REINDEX TABLE CONCURRENTLY "Committee"`;
    
    logger.info("Committee table maintenance completed");
  } catch (error) {
    logger.error("Error during Committee table maintenance:", error);
    throw error;
  }
}
