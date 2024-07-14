import createDBMissingSlots from "@/src/db/slots.js";
import { getPrisma } from "@/src/lib/prisma.js";
import { scheduleTasks } from "@/src/scheduler/index.js";

const prisma = getPrisma();

async function main() {
  await prisma.$connect();

  // pull missing slots
  await createDBMissingSlots();

  scheduleTasks();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
