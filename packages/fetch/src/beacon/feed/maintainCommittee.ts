import { CustomLogger } from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export async function maintainCommittee(logger: CustomLogger) {
  try {
    logger.info('Start.');

    logger.info('Running VACUUM on Committee table');
    await prisma.$executeRaw`VACUUM (VERBOSE, ANALYZE) "Committee"`;

    logger.info('Done.');
  } catch (error) {
    logger.error('Error during Committee table maintenance:', error);
    throw error;
  }
}
