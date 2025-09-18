import { test, expect, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';

import { epochCreationMachine } from './epochCreator.machine.js';

vi.mock('@/src/env.js', () => ({
  env: {
    BEACON_SLOT_DURATION_IN_SECONDS: 1, // Use 1 second for faster tests
  },
}));

describe('epochCreationMachine', () => {
  test('should initialize with correct context and transition to readLastCreated', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 100 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async (_: { input: { lastEpoch: number | null } }) => [101, 102, 103],
    );
    const mockEnqueueEpochs = fromPromise(async (_: { input: { epochsToCreate: number[] } }) => ({
      count: 3,
    }));

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Assert
    const snapshot = actor.getSnapshot();

    // Check that context is properly initialized
    expect(snapshot.context.lastEpoch).toBe(0);
    expect(snapshot.context.epochsToCreate).toEqual([]);

    // The machine should automatically transition to 'readLastCreated' due to the 'always' transition
    expect(snapshot.value).toBe('readLastCreated');
  });

  test('should successfully transition from readLastCreated to getEpochsToCreate', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 150 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [151, 152, 153],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 3 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for the async operation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - The machine completes the full workflow and ends in sleep
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(150);
    expect(snapshot.context.epochsToCreate).toEqual([151, 152, 153]);
  });

  test('should handle readLastCreated error and transition to sleep', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async (): Promise<number | null> => {
      throw new Error('Database connection failed');
    });
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [101, 102, 103],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 3 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for the async operation to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    // Context should remain unchanged on error
    expect(snapshot.context.lastEpoch).toBe(0);
  });

  test('should successfully transition from getEpochsToCreate to createEpochs', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 200 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [201, 202, 203, 204],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 4 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - The machine completes the full workflow and ends in sleep
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(200);
    expect(snapshot.context.epochsToCreate).toEqual([201, 202, 203, 204]);
  });

  test('should handle getEpochsToCreate error and transition to sleep', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 300 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }): Promise<number[]> => {
        throw new Error('Failed to compute epochs');
      },
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 3 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for the async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(300);
    // epochsToCreate should remain empty on error
    expect(snapshot.context.epochsToCreate).toEqual([]);
  });

  test('should successfully transition from createEpochs to sleep', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 400 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [401, 402],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input }: { input: { epochsToCreate: number[] } }) => ({
        count: input.epochsToCreate.length,
      }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(400);
    expect(snapshot.context.epochsToCreate).toEqual([401, 402]);
  });

  test('should handle createEpochs error and transition to sleep', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 500 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [501, 502, 503],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({
        input: _input,
      }: {
        input: { epochsToCreate: number[] };
      }): Promise<{ count: number }> => {
        throw new Error('Failed to enqueue epochs');
      },
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(500);
    expect(snapshot.context.epochsToCreate).toEqual([501, 502, 503]);
  });

  test('should handle empty epochs list from getEpochsToCreate', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 600 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [] as number[], // Empty array
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 0 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(600);
    expect(snapshot.context.epochsToCreate).toEqual([]);
  });

  test('should handle null lastEpoch from getLastCreatedEpoch', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => null as number | null); // No previous epoch
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [1, 2, 3],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 3 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(null);
    expect(snapshot.context.epochsToCreate).toEqual([1, 2, 3]);
  });

  test('should complete full workflow successfully', async () => {
    // Arrange
    const mockGetLastCreatedEpoch = fromPromise(async () => 1000 as number | null);
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [
        1001, 1002, 1003, 1004, 1005,
      ],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input }: { input: { epochsToCreate: number[] } }) => ({
        count: input.epochsToCreate.length,
      }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');
    expect(snapshot.context.lastEpoch).toBe(1000);
    expect(snapshot.context.epochsToCreate).toEqual([1001, 1002, 1003, 1004, 1005]);
  });

  test('should transition from sleep back to initialize after timeout', async () => {
    // Arrange
    let callCount = 0;
    const mockGetLastCreatedEpoch = fromPromise(async (): Promise<number | null> => {
      callCount++;
      if (callCount === 1) {
        // First call: throw error to go to sleep
        throw new Error('Test error to go to sleep');
      } else {
        // Second call: return a value but with delay to capture intermediate state
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 999;
      }
    });
    const mockGetEpochsToCreate = fromPromise(
      async ({ input: _input }: { input: { lastEpoch: number | null } }) => [101, 102, 103],
    );
    const mockEnqueueEpochs = fromPromise(
      async ({ input: _input }: { input: { epochsToCreate: number[] } }) => ({ count: 3 }),
    );

    const testMachine = epochCreationMachine.provide({
      actors: {
        getLastCreatedEpoch: mockGetLastCreatedEpoch,
        getEpochsToCreate: mockGetEpochsToCreate,
        enqueueEpochs: mockEnqueueEpochs,
      },
    });

    const actor = createActor(testMachine);

    // Act
    actor.start();

    // Wait for error to occur and machine to go to sleep
    await new Promise((resolve) => setTimeout(resolve, 10));

    let snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('sleep');

    // Wait for the sleep timeout (1 second as per env mock)
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait a bit more than 1 second

    // Assert - The machine should transition back to readLastCreated after timeout
    // and should still be in readLastCreated because the actor is still running
    snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('readLastCreated'); // After timeout, it goes back to initialize -> readLastCreated
  });
});
