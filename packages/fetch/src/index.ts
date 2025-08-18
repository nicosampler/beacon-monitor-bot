//import createMissingSlots from "@/src/feed/createMissingSlots.js";
//import { fetchValidatorsBalances } from '@/src/feed/fetchValidatorsBalances.js';

import { getMultiMachineLogger } from '@/src/lib/multiMachineLogger.js';
import createLogger from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
// import { scheduleTasks } from '@/src/scheduler/index.js';
import { initValidators } from '@/src/utils/initValidators.js';
import { getCreateEpochActor, getProcessEpochActor } from '@/src/xstate/epoch/index.js';

const prisma = getPrisma();
const logger = createLogger('index file');

async function main() {
  await prisma.$connect();

  // Initialize validators if table is empty
  // await initValidators();

  // scheduleTasks();

  const createEpochsActor = getCreateEpochActor();
  createEpochsActor.start();

  const processEpochs = getProcessEpochActor();
  processEpochs.start();

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
