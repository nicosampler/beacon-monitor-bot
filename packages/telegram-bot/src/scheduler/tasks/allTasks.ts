import {
  tokenPriceTask,
  tokenPriceTaskImp,
} from "@/src/scheduler/tasks/tokenPriceTask.js";
import {
  updateUsersStats,
  updateUsersStatsImp,
} from "@/src/scheduler/tasks/updateUsersStats.js";

export const allTasks = {
  tokenPrice: { task: tokenPriceTask, imp: tokenPriceTaskImp },
  notifyUsers: { task: updateUsersStats, imp: updateUsersStatsImp },
};
