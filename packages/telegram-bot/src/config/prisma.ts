import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined = undefined;

export const getPrisma = () => {
  if (prisma) return prisma;
  prisma = new PrismaClient({
    datasourceUrl: `${process.env.DATABASE_URL}&pool_min=2&pool_max=4`,
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
