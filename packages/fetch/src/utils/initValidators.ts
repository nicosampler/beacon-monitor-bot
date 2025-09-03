import { fetchValidators } from '@/src/beacon/feed/fetchValidators.js';
import createLogger from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';

const prisma = getPrisma();

export const initValidators = async () => {
  // const logger = createLogger('initValidators');
  // logger.info('Checking if validators ...');

  try {
    // Check if the validators table is empty
    const count = await prisma.validator.count();

    if (count === 0) {
      //logger.info('Starting to fetch validators...');

      // Fetch validators using the provided function
      const _fetchValidators = async () => {
        const logger = createLogger('fetchValidators', true);
        logger.setContext(`head`);
        await fetchValidators(logger, 'head');
      };

      await _fetchValidators();
      //logger.info('Done!');
    } else {
      //logger.info(`Skipping: Validators already initialized.`);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
};
