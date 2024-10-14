## Context Overview

Please review the following files to get a comprehensive understanding of the context:

- `prisma/schema.prisma`: Defines the database schema.
- `packages/beacon-fetch/src/beacon/utils/time.ts`: Contains utility functions for time calculations.
- `packages/beacon-fetch/src/scheduler/tasks/summarizeAttestationsHourly.ts`: Implements the main function to summarize attestations hourly.
- `packages/beacon-fetch/src/env.ts`: Manages environment variables that affect the function's behavior.
- `packages/beacon-fetch/src/lib/pino.ts`: Configures logging for the application.
- `packages/beacon-fetch/src/scheduler/tasks/summarize.ts`: Schedules the `summarizeAttestationsHourly` function to run hourly.

## Objective

The `summarizeAttestationsHourly` function aims to aggregate beacon chain attestations into hourly statistics, recording the sum of missed attestations per validator in the `HourlyValidatorStats` table.

## Functionality

1. Calculate the start and end slots based on provided times, adjusting for `env.BEACON_SLOTS_PER_EPOCH` to accommodate late attestations.
2. Return early if the current time is less than `end slot + 1` to ensure all attestations are accounted for.
3. Verify that all slots in the specified range have their `attestationsFetched` status set to true; if any are false, return without processing.
4. Aggregate missed attestations by slot and validator index, using data from the `Committee` table. if an attestation has a delay of `env.BEACON_MAX_ATTESTATION_DELAY` or more, we count it as missed.
5. Summarize the missed attestations for each validator and store these statistics in the `HourlyValidatorStats` table.
6. Remove processed records from the `Committee` table to maintain database cleanliness.
7. Run the task to summarize the attestations hourly.
   - Get the last summarized attestations timestamp from the `HourlyValidatorStats` table.
   - Calculate the first and last slot and start and end date for the next summary as one hour after the last summarized timestamp. If the last slot is in the future, return without processing.

## Considerations

- To log information about the function's execution, use the logger instance returned from `createLogger`.

- `HourlyValidatorStats` is updated by different functions, so we need to be careful not to override values from other functions.
- The amount of validators is high, we should send updates in batches.
- Optimize query performance to handle data efficiently.
- Assess and implement necessary indexes to expedite query execution.
