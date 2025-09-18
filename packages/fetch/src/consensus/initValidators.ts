import { fetchValidators } from '@/src/consensus/feed/fetchValidators.js';
import createLogger from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export const initValidators = async () => {
  const logger = createLogger('fetchValidators', true);

  // Check if the validators table is empty
  const count = await prisma.validator.count();

  if (count === 0) {
    // Fetch validators using the provided function
    const _fetchValidators = async () => {
      await fetchValidators('head');
    };

    await _fetchValidators();
    logger.info(`Validators fetched.`);
  } else {
    logger.info(`Skipping: Validators already initialized.`);
  }
};
