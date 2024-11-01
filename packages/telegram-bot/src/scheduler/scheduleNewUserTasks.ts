import { SimpleIntervalJob } from "toad-scheduler";

import { allTasks } from "@/src/scheduler/tasks/allTasks.js";
import { scheduler } from "@/src/config/index.js";
import {
  TOKEN_PRICE_JOB_TIME,
  NOTIFY_USERS_JOB_TIME,
  WITHDRAWABLE_JOB_TIME,
} from "@/src/constants/index.js";

if (
  isNaN(Number(TOKEN_PRICE_JOB_TIME)) ||
  isNaN(Number(NOTIFY_USERS_JOB_TIME))
) {
  throw new Error(
    "One or more environment variables are missing or not a number"
  );
}

export function scheduleUsersTasks() {
  // withdrawable
  const withdrawableJob = new SimpleIntervalJob(
    { minutes: WITHDRAWABLE_JOB_TIME, runImmediately: true },
    allTasks.withdrawable.task,
    {
      id: "withdrawable",
      preventOverrun: true,
    }
  );

  // token price
  const tokenPriceJob = new SimpleIntervalJob(
    { minutes: TOKEN_PRICE_JOB_TIME, runImmediately: true },
    allTasks.tokenPrice.task,
    {
      id: "tokenPrice",
      preventOverrun: true,
    }
  );

  // user's notifications
  const notifyUsersJob = new SimpleIntervalJob(
    { minutes: NOTIFY_USERS_JOB_TIME, runImmediately: true },
    allTasks.notifyUsers.task,
    {
      id: "notifyUsers",
      preventOverrun: true,
    }
  );

  scheduler.addSimpleIntervalJob(tokenPriceJob);
  scheduler.addSimpleIntervalJob(withdrawableJob);
  scheduler.addSimpleIntervalJob(notifyUsersJob);
}
