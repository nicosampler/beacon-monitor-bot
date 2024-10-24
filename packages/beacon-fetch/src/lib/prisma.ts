import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  // Add query timeout configuration
  log: [
    {
      emit: "event",
      level: "query",
    },
  ],
});

export const getPrisma = () => prisma;
