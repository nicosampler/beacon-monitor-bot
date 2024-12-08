import { SimpleIntervalJob } from "toad-scheduler";

import { allTasks } from "@/src/scheduler/allTasks.js";
import { scheduler } from "@/src/config/index.js";

export function scheduleUsersTasks() {
  // token price
  const tokenPriceJob = new SimpleIntervalJob(
    { minutes: 1, runImmediately: true },
    allTasks.tokenPrice.task,
    {
      id: "tokenPrice",
      preventOverrun: true,
    }
  );

  // user's notifications
  const notifyUsersJob = new SimpleIntervalJob(
    { minutes: 1, runImmediately: true },
    allTasks.notifyUsers.task,
    {
      id: "notifyUsers",
      preventOverrun: true,
    }
  );

  scheduler.addSimpleIntervalJob(tokenPriceJob);
  scheduler.addSimpleIntervalJob(notifyUsersJob);
}
