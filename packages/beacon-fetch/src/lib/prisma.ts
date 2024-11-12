import { env } from "@/src/env.js";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined = undefined;

export const getPrisma = () => {
  if (prisma) return prisma;
  prisma = new PrismaClient({
    datasourceUrl: `${env.DATABASE_URL}&pool_min=5&pool_max=10`,
    log: [
      {
        emit: "event",
        level: "query",
      },
    ],
  });
  return prisma;
};

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
