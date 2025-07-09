truncate "Epoch";
truncate "Slot" cascade;
truncate "Committee" cascade;
truncate "SyncCommittee" cascade;
-- truncate "Validator" cascade;

truncate "ExecutionRewards";

truncate "HourlyValidatorStats";
truncate "HourlyBlockAndSyncRewards";
truncate "HourlyExecutionRewards";

truncate "DailyExecutionRewards";
truncate "DailyValidatorStats";

truncate "LastSummaryUpdate";

truncate "User" cascade;
truncate "WithdrawalAddress" cascade;
truncate "FeeRewardAddress" cascade;