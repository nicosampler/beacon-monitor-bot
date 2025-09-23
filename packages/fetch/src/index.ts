import { PrismaClient } from '@prisma/client';
import ms from 'ms';

import { env } from '@/src/lib/env.js';
import createLogger from '@/src/lib/pino.js';
import { BeaconClient } from '@/src/services/consensus/beacon.js';
import { EpochController } from '@/src/services/consensus/controllers/epoch.js';
import { ValidatorsController } from '@/src/services/consensus/controllers/validators.js';
import { EpochStorage } from '@/src/services/consensus/storage/epoch.js';
import { ValidatorsStorage } from '@/src/services/consensus/storage/validators.js';
import { BeaconTime } from '@/src/services/consensus/utils/time.js';
import initXstateMachines from '@/src/xstate/index.js';
import { getMultiMachineLogger } from '@/src/xstate/multiMachineLogger.js';

const logger = createLogger('index file');

const prisma = new PrismaClient({
  datasourceUrl: `${env.DATABASE_URL}&pool_timeout=0`,
});

async function main() {
  await prisma.$connect();

  // Initialize dependencies
  const beaconClient = new BeaconClient({
    fullNodeUrl: env.BEACON_API_URL,
    fullNodeConcurrency: env.BEACON_API_REQUEST_PER_SECOND,
    fullNodeRetries: 10,
    archiveNodeUrl: env.BEACON_API_BKP_URL,
    archiveNodeConcurrency: env.BEACON_API_REQUEST_PER_SECOND,
    archiveNodeRetries: 30,
    baseDelay: ms('1s'),
  });

  const beaconTime = new BeaconTime({
    genesisTimestamp: env.BEACON_GENESIS_TIMESTAMP,
    slotDurationMs: env.BEACON_SLOT_DURATION_IN_SECONDS * 1000,
    slotsPerEpoch: env.BEACON_SLOTS_PER_EPOCH,
    epochsPerSyncCommitteePeriod: env.BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD,
  });

  const validatorsStorage = new ValidatorsStorage(prisma);
  const validatorsController = new ValidatorsController(beaconClient, validatorsStorage);

  const epochStorage = new EpochStorage(prisma);
  const epochController = new EpochController(beaconClient, epochStorage);

  // Start indexing the beacon chain
  await validatorsController.initValidators();

  await initXstateMachines(epochController, beaconTime, env.BEACON_SLOT_DURATION_IN_SECONDS);

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
