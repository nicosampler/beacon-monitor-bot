import { getMultiMachineLogger } from '@/src/lib/multiMachineLogger.js';
import createLogger from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
import { getCreateEpochActor, getEpochOrchestratorActor } from '@/src/xstate/epoch/index.js';

const prisma = getPrisma();
const logger = createLogger('index file');

async function main() {
  await prisma.$connect();

  // Initialize validators if table is empty
  // await initValidators();

  const createEpochsActor = getCreateEpochActor();
  createEpochsActor.start();

  const epochOrchestratorActor = getEpochOrchestratorActor();
  epochOrchestratorActor.start();

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
