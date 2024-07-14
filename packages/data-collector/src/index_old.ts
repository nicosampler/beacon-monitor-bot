import {
  startOfHour,
  startOfDay,
  startOfWeek,
  startOfMonth,
  subHours,
  subDays,
  subWeeks,
  subMonths,
} from "date-fns";
import { getPrisma } from "@/src/lib/prisma.js";
import { TimeFrame } from "@/src/types.js";

import { env } from "@/src/env.js";

const prisma = getPrisma();

interface Stat {
  validatorIndex: string;
  executionRewards: string;
  beaconRewards: any;
  performance: number;
  timestamp: Date;
}

function getTimeFrameRange(timeFrame: TimeFrame): [Date, Date] {
  const now = new Date();
  let startTime: Date;
  let endTime: Date;

  switch (timeFrame) {
    case "hourly":
      startTime = startOfHour(subHours(now, 1));
      endTime = startOfHour(now);
      break;
    case "daily":
      startTime = startOfDay(subDays(now, 1));
      endTime = startOfDay(now);
      break;
    case "weekly":
      startTime = startOfWeek(subWeeks(now, 1));
      endTime = startOfWeek(now);
      break;
    case "monthly":
      startTime = startOfMonth(subMonths(now, 1));
      endTime = startOfMonth(now);
      break;
    case "yearly":
      startTime = new Date(now.getFullYear() - 1, 0, 1);
      endTime = new Date(now.getFullYear(), 0, 1);
      break;
  }

  return [startTime, endTime];
}

async function aggregateData(timeFrame: TimeFrame): Promise<string> {
  const now = new Date();

  const [startTime, endTime] = getTimeFrameRange(timeFrame);

  // Fetch and aggregate data
  // const rawValidationsSlot = await prisma.validationsSlot.findMany({
  //   where: {
  //     timestamp: {
  //       gte: startTime,
  //       lt: endTime,
  //     },
  //   },
  // });

  const aggregatedStats: { [key: string]: Stat } = {};

  // rawValidationsSlot.forEach((vs) => {
  //   vs.validators.forEach((validatorIndex) => {
  //     if (!aggregatedStats[validatorIndex]) {
  //       aggregatedStats[validatorIndex] = {
  //         validatorIndex,
  //         executionRewards: "0", // Initialize as needed
  //         beaconRewards: {},
  //         performance: 0,
  //         timestamp: endTime,
  //       };
  //     }
  //     aggregatedStats[validatorIndex].performance += validatorIndex.performance;
  //     // Aggregate other metrics as needed
  //   });
  // });

  // const statsArray = Object.values(aggregatedStats);

  // switch (timeFrame) {
  //   case "hourly":
  //     await prisma.hourlyValidatorStats.createMany({ data: statsArray });
  //     break;
  //   case "daily":
  //     await prisma.dailyValidatorStats.createMany({ data: statsArray });
  //     break;
  //   case "weekly":
  //     await prisma.weeklyValidatorStats.createMany({ data: statsArray });
  //     break;
  //   case "monthly":
  //     await prisma.monthlyValidatorStats.createMany({ data: statsArray });
  //     break;
  //   case "yearly":
  //     await prisma.yearlyValidatorStats.createMany({ data: statsArray });
  //     break;
  // }

  // // Delete processed raw data
  // if (timeFrame !== "yearly") {
  //   await prisma.validationsSlot.deleteMany({
  //     where: {
  //       timestamp: {
  //         gte: startTime,
  //         lt: endTime,
  //       },
  //     },
  //   });
  // }

  // return `Data aggregated and moved to ${timeFrame} table for interval ${format(
  //   startTime,
  //   "yyyy-MM-dd HH:mm:ss"
  // )} to ${format(endTime, "yyyy-MM-dd HH:mm:ss")}.`;

  return "";
}

// Example usage
(async () => {
  env.DATABASE_URL;
  console.log(await aggregateData("hourly"));
  console.log(await aggregateData("daily"));
  console.log(await aggregateData("weekly"));
  console.log(await aggregateData("monthly"));
  console.log(await aggregateData("yearly"));
  await prisma.$disconnect();
})();
