import {
  withdrawableTask,
  withdrawableTaskImp,
} from "@/src/scheduler/tasks/withdrawableTask";
import {
  tokenPriceTask,
  tokenPriceTaskImp,
} from "@/src/scheduler/tasks/tokenPriceTask";
import {
  updateUsersStats,
  updateUsersStatsImp,
} from "@/src/scheduler/tasks/updateUsersStats";

export const allTasks = {
  withdrawable: { task: withdrawableTask, imp: withdrawableTaskImp },
  tokenPrice: { task: tokenPriceTask, imp: tokenPriceTaskImp },
  notifyUsers: { task: updateUsersStats, imp: updateUsersStatsImp },
};
