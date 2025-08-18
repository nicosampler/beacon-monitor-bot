//import createMissingSlots from "@/src/feed/createMissingSlots.js";
//import { fetchValidatorsBalances } from '@/src/feed/fetchValidatorsBalances.js';
import createLogger from '@/src/lib/pino.js';
import { getPrisma } from '@/src/lib/prisma.js';
// import { scheduleTasks } from '@/src/scheduler/index.js';
import { createEpochActor, createEpochOrchestratorActor } from '@/src/xstate/epoch/index.js';

const prisma = getPrisma();
const logger = createLogger('index file');

async function main() {
  await prisma.$connect();

  // if (!(await prisma.validator.findFirst())) {
  //   await fetchValidatorsBalances(logger);
  // }

  // scheduleTasks();

  const epochActor = createEpochActor();
  epochActor.start();

  const epochOrchestratorActor = createEpochOrchestratorActor();
  epochOrchestratorActor.start();
}

main()
  .catch((e) => {
    logger.error('', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
