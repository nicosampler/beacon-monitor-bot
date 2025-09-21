import { PrismaClient } from '@prisma/client';
import ms from 'ms';

import { env } from '@/src/lib/env.js';
import createLogger from '@/src/lib/pino.js';
import { BeaconClient } from '@/src/services/consensus/beacon.js';
import { ValidatorsController } from '@/src/services/consensus/controllers/validators.js';
import { ValidatorsStorage } from '@/src/services/consensus/storage/validatorsStorage.js';
import initXstateMachines from '@/src/xstate/index.js';
import { getMultiMachineLogger } from '@/src/xstate/multiMachineLogger.js';

const logger = createLogger('index file');

const prisma = new PrismaClient({
  datasourceUrl: `${env.DATABASE_URL}&pool_timeout=0`,
  log: [
    {
      emit: 'event',
      level: 'query',
    },
  ],
});

async function main() {
  await prisma.$connect();

  const beaconClient = new BeaconClient({
    fullNodeUrl: env.BEACON_API_URL,
    fullNodeConcurrency: env.BEACON_API_REQUEST_PER_SECOND,
    fullNodeRetries: 10,
    archiveNodeUrl: env.BEACON_API_BKP_URL,
    archiveNodeConcurrency: env.BEACON_API_REQUEST_PER_SECOND,
    archiveNodeRetries: 30,
    baseDelay: ms('1s'),
  });

  const validatorsStorage = new ValidatorsStorage(prisma);
  const validatorsController = new ValidatorsController(beaconClient, validatorsStorage);

  // Initialize validators if table is empty
  await validatorsController.initValidators();

  await initXstateMachines();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    getMultiMachineLogger().done();
    process.exit(0);
  });
}

main()
  .catch((e) => {
    logger.error('', e);
    getMultiMachineLogger().done();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
