## Tasks

### [fetchCommitteeTask](./src/scheduler/tasks/fetchCommittee.ts)

This task is responsible for maintaining the Slots and committee assignments data in the database. Committee assignments are crucial for tracking validator performance and attestation duties.

#### Process Flow:

1. Calculates the current head slot based on the current timestamp
2. Retrieves the last processed slot from the database (`Slot` table)
3. Determines the next slot to fetch (either last_processed_slot + 1 or oldest lookback slot if starting fresh)
4. Fetches committee data for the calculated epoch from the beacon node
5. Skips processing if:
   - The target epoch is too far in the future
   - The attestation processing is significantly delayed (25 epochs behind)

#### Database Impact:

The task updates two main tables:

- `Slot`: Creates new slot entries with `attestationsFetched = false`
- `Committee`: Creates committee assignments records linking validators to slots
  - Each record contains: slot, committee index, validator's position (aggregationBitsIndex), and validator index

#### Data Relationships:

- Each slot have multiple committee
- Committee records are essential for:
  - Tracking validator attestation (missed, delayed or in-time)
  - Computing validator performance statistics

### [fetchAttestationsTask](./src/scheduler/tasks/fetchAttestations.ts)

This task processes validator attestations for each slot, updating the attestation for each validator.

#### Process Flow:

1. Calculates the current slot and determines the next slot to fetch. maximum slot to fetch is defined by (current - BEACON_DELAY_SLOTS_TO_HEAD)
2. Retrieves the last processed slot with attestations from the database and compares it with the maximum slot to fetch. Then fetches last processed slot + 1 if it is within the maximum slot to fetch.
3. For each slot:
   - Verifies committee data exists for the slot
   - Fetches attestation data from the beacon node
   - If slot is missed, marks it as processed and continues
   - Processes attestation data:
     - Filters out old attestations
     - Processes each attestation's aggregation bits
     - Categorizes attestations as on-time (rows are deleted) or delayed (rows are updated with the difference between slot_where_was_received - expected_slot_to_come)

#### Database Impact:

- `Committee`: Updates or removes committee records based on attestation status ([see Prune Committee table](#prune-committee-table))
  - Updates `attestationDelay` for delayed attestations
  - Removes records for on-time attestations (delay <= BEACON_MAX_ATTESTATION_DELAY)
- `Slot`: Updates `attestationsFetched` to true after processing

#### Data Relationships:

- Each attestation can affect multiple committee records
- Attestation processing is idempotent:
  - Partial updates are safe
  - Missing updates will be applied in subsequent runs
  - On-time attestations take precedence over delayed ones

### [fetchBeaconRewardsTask](./src/scheduler/tasks/fetchBeaconRewards.ts)

This task is responsible for fetching and storing validator rewards data at the end of each epoch.

#### Process Flow:

1. Calculates the current epoch and determines the head epoch (current - 2 for buffer)
2. Retrieves the last processed epoch with `rewardsFetched = true` from the database
3. Determines the next epoch to fetch:
   - If starting fresh: uses oldest lookback epoch
   - Otherwise: uses last_processed_epoch + 1 (only if it's less than head epoch)
4. Skips processing if:
   - The last processed epoch + 1 is beyond the head epoch
   - The target epoch is too far in the future
5. For each epoch:
   - Creates epoch record if it doesn't exist
   - Fetches attestation rewards for all validators
   - Processes rewards data in batches for efficient database operations

#### Database Impact:

The task updates multiple tables:

- `Epoch`: Handles the epoch processing status in two phases:

  1. Initial Phase (Before fetching rewards):
     - Always ensures an epoch record exists in the database
     - If creates it if doesn't exists: Sets `rewardsFetched = false`
     - If record exists: Leaves it unchanged
  2. Processing Phase (After fetching rewards):
     - First checks if rewards were already processed
     - If `rewardsFetched = true`: Skips processing to avoid duplicates
     - If `rewardsFetched = false`: Processes rewards and sets flag to `true`

- `HourlyValidatorStats`:
  - Creates or updates validator statistics using a temporary table for efficient batch processing
  - Stores rewards data including:
    - Head rewards
    - Target rewards
    - Source rewards
    - Inactivity penalties
  - Merges new data with existing records, accumulating rewards values

### [fetchBlockAndSyncRewardsTask](./src/scheduler/tasks/fetchBlockAndSyncRewards.ts)

This task is responsible for fetching and storing block proposer rewards and sync committee rewards for validators at each slot.

#### Process Flow:

1. Calculates the current slot based on the current timestamp
2. Determines the maximum slot to fetch (current - BEACON_DELAY_SLOTS_TO_HEAD)
3. Retrieves the last processed slot with sync rewards from the database
4. Determines the next slot to fetch:
   - If starting fresh: uses oldest lookback slot
   - Otherwise: uses last_processed_slot + 1 (only if it's less than max slot to fetch)
5. Skips processing if:
   - The target slot is beyond the maximum slot to fetch

#### Database Impact:

The task updates one main table:

- `HourlyBlockAndSyncRewards`: 
  - Updates or creates records for validators who:
    - Proposed blocks (adds block rewards)
    - Participated in sync committees (adds sync committee rewards)
  - Merges new rewards data with existing records:
    - Preserves existing attestation rewards data
    - Adds block and sync committee rewards to existing records
    - Creates new records if none exist for the hour

#### Data Relationships:

- Records are aggregated by validator, date, and hour
- Updates are non-destructive:
  - Existing attestation data is preserved
  - Block and sync committee rewards are added to existing records
  - Processing is idempotent to prevent duplicate rewards

### [summarizeDailyTask](./src/scheduler/tasks/summarizeDaily.ts)

This task is responsible for aggregating hourly validator statistics into daily summaries, ensuring data completeness by maintaining a 24-hour delay in processing.

#### Process Flow:

1. Retrieves the last summarized date from the `LastSummaryUpdate` table
2. Determines the next date to summarize:
   - If starting fresh: uses the date of oldest lookback slot
   - Otherwise: uses last_summary_date + 1 day
3. Skips processing if:
   - The target date is less than 24 hours old (ensures complete hourly data)
   - Missing hourly validator statistics for any hour in the target date
   - Missing consensus layer rewards data for any slot in the target date:
     - Attestation rewards
     - Block proposal rewards
     - Sync committee rewards
   - Missing execution layer rewards data for any block in the target date
   - Missing validator balance data for the target date
4. For each summarization:
   - Converts dates to UTC to ensure consistent daily boundaries
   - Aggregates all validator statistics for the 24-hour period
   - Processes rewards and performance metrics
   - Updates the last summary timestamp after successful processing

#### Database Impact:

The task updates two main tables:

- `LastSummaryUpdate`: 
  - Tracks the last successfully processed date via `dailyValidatorStats` field
  - Used to maintain continuity between task runs

- `DailyValidatorStats`:
  - Aggregates hourly statistics into daily summaries
  - Combines data including:
    - Attestation rewards and penalties
    - Block rewards
    - Sync committee rewards
    - Missed and delayed attestations

#### Data Relationships:

- Processes data from `HourlyValidatorStats` into daily summaries
- Processing is sequential and date-based:
  - Ensures no gaps in daily summaries
  - Maintains 24-hour delay to guarantee data completeness
  - Each day is processed only once

### General considerations

#### Prune Committee table

The Committee table tracks validator attestations based on their timing. Attestations are categorized into three states:

1. **On-time attestations** (slot + 1):

   - Considered optimal performance
   - Records are removed from the table

2. **Delayed attestations** (within BEACON_MAX_ATTESTATION_DELAY slots):

   - Attestations that arrive after the maximum delay threshold
   - Records are kept with their `attestationDelay` value

3. **Missed attestations** (no attestation received):
   - Records are kept in the table

To manage database growth, the table implements a pruning strategy:

- Records of on-time attestations are removed as they represent normal operation
- Delayed and missed attestation records are retained for:
  - Performance monitoring
  - Inactivity detection
  - Historical analysis
  - Node operator notifications
