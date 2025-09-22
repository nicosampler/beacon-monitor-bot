import { test, expect, vi, beforeEach } from 'vitest';
import { createActor, createMachine, sendParent } from 'xstate';

import { createControllablePromise } from '@/src/__tests__/utils.js';
import { EpochController } from '@/src/services/consensus/controllers/epoch.js';

const mockEpochController = {
  getLastCreated: vi.fn(),
  getEpochsToCreate: vi.fn(),
  createEpochs: vi.fn(),
  getMinEpochToProcess: vi.fn(),
} as unknown as EpochController;

// Mock the logging functions - simple mocks that do nothing
const mockLogActor = vi.fn();

// Mock the modules
vi.mock('@/src/xstate/pinoLog.js', () => ({
  pinoLog: vi.fn(() => () => {}),
}));

vi.mock('@/src/xstate/multiMachineLogger.js', () => ({
  logActor: vi.fn(),
}));

// Mock the epoch processor machine to avoid database and network calls
vi.mock('@/src/xstate/epoch/epochProcessor.machine.js', () => {
  const mockMachine = createMachine({
    id: 'EpochProcessor',
    types: {} as {
      events: { type: 'complete' };
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          complete: 'completed',
        },
      },
      completed: {
        entry: [
          sendParent(() => ({
            type: 'EPOCH_COMPLETED',
            machineId: `epochProcessor:100`,
          })),
          () => console.log('Sending EPOCH_COMPLETED to parent'),
        ],
        type: 'final',
      },
    },
  });

  return {
    epochProcessorMachine: mockMachine,
  };
});

// Import the orchestrator after mocks are set up
import { epochOrchestratorMachine } from '@/src/xstate/epoch/epochOrchestrator.machine.js';

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockLogActor.mockReturnValue(undefined);
});

describe('epochOrchestratorMachine', () => {
  test('should initialize with correct context and transition to gettingMinEpoch', async () => {
    // Arrange
    const controllableGetMinEpochPromise = createControllablePromise<null>();

    vi.mocked(mockEpochController.getMinEpochToProcess).mockImplementation(
      () => controllableGetMinEpochPromise.promise,
    );

    const actor = createActor(epochOrchestratorMachine, {
      input: {
        slotDuration: 0.1, // 100ms for faster tests
        lookbackSlot: 32,
        epochController: mockEpochController,
      },
    });

    // Act
    actor.start();

    // Assert - Check state immediately after start (before async operation completes)
    let snapshot = actor.getSnapshot();

    // Check that context is properly initialized
    expect(snapshot.context.epochData).toBe(null);
    expect(snapshot.context.epochActor).toBe(null);
    expect(snapshot.context.slotDuration).toBe(0.1);
    expect(snapshot.context.lookbackSlot).toBe(32);

    // The machine should be in gettingMinEpoch state
    expect(snapshot.value).toBe('gettingMinEpoch');

    // Verify that getMinEpochToProcess was called at least once
    expect(vi.mocked(mockEpochController.getMinEpochToProcess)).toHaveBeenCalledTimes(1);

    // Now resolve the promise to complete the async operation
    controllableGetMinEpochPromise.resolve(null);

    // Wait for the state transition to complete
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Assert - Should transition to noMinEpochToProcess after resolving with null
    snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('noMinEpochToProcess');
    expect(snapshot.context.epochData).toBe(null);

    // Clean up
    actor.stop();
  });

  test('should handle getMinEpochToProcess error and retry after 1s', async () => {
    // Arrange
    const controllableGetMinEpochPromise = createControllablePromise<null>();

    vi.mocked(mockEpochController.getMinEpochToProcess).mockImplementation(
      () => controllableGetMinEpochPromise.promise,
    );

    const actor = createActor(epochOrchestratorMachine, {
      input: {
        slotDuration: 0.1, // 100ms for faster tests
        lookbackSlot: 32,
        epochController: mockEpochController,
      },
    });

    // Track state transitions for additional verification
    const stateTransitions: string[] = [];
    const subscription = actor.subscribe((snapshot) => {
      stateTransitions.push(snapshot.value as string);
    });

    // Act
    actor.start();

    // Assert - Should be in gettingMinEpoch state initially
    let snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('gettingMinEpoch');
    expect(vi.mocked(mockEpochController.getMinEpochToProcess)).toHaveBeenCalledTimes(1);

    // Now reject the promise to trigger error handling
    controllableGetMinEpochPromise.reject(new Error('Database connection failed'));

    // Wait for the state transition to complete
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Assert - Should transition to noMinEpochToProcess after error
    snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('noMinEpochToProcess');

    // Verify we went through the expected states
    expect(stateTransitions).toContain('gettingMinEpoch');
    expect(stateTransitions).toContain('noMinEpochToProcess');

    // Wait for retry (33ms delay + some buffer)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - Should have been called at least 2 times (initial + retry)
    expect(
      vi.mocked(mockEpochController.getMinEpochToProcess).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);

    // Verify we have at least 2 gettingMinEpoch transitions (initial + retry)
    const gettingMinEpochCount = stateTransitions.filter(
      (state) => state === 'gettingMinEpoch',
    ).length;
    expect(gettingMinEpochCount).toBeGreaterThanOrEqual(2);

    // Clean up
    subscription.unsubscribe();
    actor.stop();
  });

  test('should handle null epoch data and transition to noMinEpochToProcess, then retry after 1s', async () => {
    // Arrange
    const controllableGetMinEpochPromise = createControllablePromise<null>();

    vi.mocked(mockEpochController.getMinEpochToProcess).mockImplementation(
      () => controllableGetMinEpochPromise.promise,
    );

    const actor = createActor(epochOrchestratorMachine, {
      input: {
        slotDuration: 0.1, // 100ms for faster tests
        lookbackSlot: 32,
        epochController: mockEpochController,
      },
    });

    // Track state transitions for additional verification
    const stateTransitions: string[] = [];
    const subscription = actor.subscribe((snapshot) => {
      stateTransitions.push(snapshot.value as string);
    });

    // Act
    actor.start();

    // Assert - Should be in gettingMinEpoch state initially
    let snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('gettingMinEpoch');
    expect(vi.mocked(mockEpochController.getMinEpochToProcess)).toHaveBeenCalledTimes(1);

    // Now resolve the promise with null to trigger the null handling
    controllableGetMinEpochPromise.resolve(null);

    // Wait for the state transition to complete
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Assert - Should transition to noMinEpochToProcess after resolving with null
    snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('noMinEpochToProcess');
    expect(snapshot.context.epochData).toBe(null);

    // Wait for the 33ms delay to complete and retry
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert - Should have been called at least 2 times (initial + retry)
    expect(
      vi.mocked(mockEpochController.getMinEpochToProcess).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);

    // Verify we went through the expected states at least the expected number of times
    const gettingMinEpochCount = stateTransitions.filter(
      (state) => state === 'gettingMinEpoch',
    ).length;
    const noMinEpochToProcessCount = stateTransitions.filter(
      (state) => state === 'noMinEpochToProcess',
    ).length;

    expect(gettingMinEpochCount).toBeGreaterThanOrEqual(2);
    expect(noMinEpochToProcessCount).toBeGreaterThanOrEqual(2);

    // Clean up
    subscription.unsubscribe();
    actor.stop();
  });

  test('should complete full workflow: gettingMinEpoch -> checkingIfCanSpawnEpochProcessor -> processingEpoch -> EPOCH_COMPLETED -> gettingMinEpoch', async () => {
    // Arrange
    const mockEpochData = {
      epoch: 100,
      validatorsBalancesFetched: false,
      rewardsFetched: false,
      committeesFetched: false,
      slotsFetched: false,
      syncCommitteesFetched: false,
      validatorsActivationFetched: false,
    };

    // Create a controllable promise for getMinEpochToProcess
    const getMinEpochPromise = createControllablePromise<typeof mockEpochData | null>();

    vi.mocked(mockEpochController.getMinEpochToProcess).mockImplementation(
      () => getMinEpochPromise.promise,
    );

    const epochOrchestratorActor = createActor(epochOrchestratorMachine, {
      input: {
        slotDuration: 0.1, // 100ms for faster tests
        lookbackSlot: 32,
        epochController: mockEpochController,
      },
    });

    // Track state transitions for verification
    const epochOrchestratorStateTransitions: string[] = [];
    const subscription = epochOrchestratorActor.subscribe((snapshot) => {
      epochOrchestratorStateTransitions.push(snapshot.value as string);
    });

    // Act
    epochOrchestratorActor.start();

    // Assert - Should be in gettingMinEpoch state initially
    let snapshot = epochOrchestratorActor.getSnapshot();
    expect(snapshot.value).toBe('gettingMinEpoch');

    // Now resolve the promise, providing the mock epoch data to continue the workflow
    getMinEpochPromise.resolve(mockEpochData);

    // Wait for the state transitions to complete (gettingMinEpoch -> checkingIfCanSpawnEpochProcessor -> processingEpoch)
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Assert - Should be in processingEpoch with epoch actor spawned
    snapshot = epochOrchestratorActor.getSnapshot();
    expect(snapshot.value).toBe('processingEpoch');
    expect(snapshot.context.epochData).toEqual(mockEpochData);
    expect(snapshot.context.epochActor).not.toBe(null);

    // Update mock to return null for subsequent calls to prevent further processing
    vi.mocked(mockEpochController.getMinEpochToProcess).mockResolvedValue(null);
    // Send EPOCH_COMPLETED event directly to the orchestrator to simulate completion
    epochOrchestratorActor.send({ type: 'EPOCH_COMPLETED', machineId: 'epochProcessor:100' });

    // Wait for the epoch processor to complete and send EPOCH_COMPLETED event
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Wait a bit more for any pending state transitions
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Assert - Should be back to noMinEpochToProcess with cleaned context
    snapshot = epochOrchestratorActor.getSnapshot();
    expect(snapshot.value).toBe('noMinEpochToProcess');
    expect(snapshot.context.epochData).toBe(null);
    expect(snapshot.context.epochActor).toBe(null);

    // Count state transitions to verify the workflow
    const gettingMinEpochCount = epochOrchestratorStateTransitions.filter(
      (state) => state === 'gettingMinEpoch',
    ).length;
    const checkingIfCanSpawnEpochProcessorCount = epochOrchestratorStateTransitions.filter(
      (state) => state === 'checkingIfCanSpawnEpochProcessor',
    ).length;
    const noMinEpochToProcessCount = epochOrchestratorStateTransitions.filter(
      (state) => state === 'noMinEpochToProcess',
    ).length;
    const processingEpochCount = epochOrchestratorStateTransitions.filter(
      (state) => state === 'processingEpoch',
    ).length;

    // Should have gone through gettingMinEpoch at least twice (initial + after completion)
    expect(gettingMinEpochCount).toBe(2);
    // Should have gone through checkingIfCanSpawnEpochProcessor twice (once with data, once without)
    expect(checkingIfCanSpawnEpochProcessorCount).toBe(2);
    // Should have gone through noMinEpochToProcess at least once
    expect(noMinEpochToProcessCount).toBe(1);
    // Should have gone through processingEpoch exactly once (only when there's data)
    expect(processingEpochCount).toBe(1);

    // Clean up
    subscription.unsubscribe();
    epochOrchestratorActor.stop();
  });

  // test('should handle epoch data with all flags set to true', async () => {
  //   // Arrange
  //   const mockEpochData = {
  //     epoch: 200,
  //     validatorsBalancesFetched: true,
  //     rewardsFetched: true,
  //     committeesFetched: true,
  //     slotsFetched: true,
  //     syncCommitteesFetched: true,
  //     validatorsActivationFetched: true,
  //   };

  //   vi.mocked(mockEpochController.getMinEpochToProcess).mockResolvedValue(mockEpochData);
  //   const mockGetMinEpochToProcess = fromPromise(async () => mockEpochData) as any;

  //   const testMachine = createTestMachine(mockGetMinEpochToProcess);

  //   const actor = createActor(testMachine, {
  //     input: {
  //       slotDuration: 12,
  //       lookbackSlot: 32,
  //       epochController: mockEpochController,
  //     },
  //   });

  //   // Act
  //   actor.start();

  //   // Wait for the async operation to complete
  //   await new Promise((resolve) => setTimeout(resolve, 100));

  //   // Assert
  //   const snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('epochProcessorRunning');
  //   expect(snapshot.context.epochData).toEqual(mockEpochData);
  //   expect(snapshot.context.epochActor).not.toBe(null);

  //   // Clean up
  //   actor.stop();
  // });

  // test('should handle multiple EPOCH_COMPLETED events correctly', async () => {
  //   // Arrange
  //   const mockEpochData = {
  //     epoch: 300,
  //     validatorsBalancesFetched: false,
  //     rewardsFetched: false,
  //     committeesFetched: false,
  //     slotsFetched: false,
  //     syncCommitteesFetched: false,
  //     validatorsActivationFetched: false,
  //   };

  //   vi.mocked(mockEpochController.getMinEpochToProcess).mockResolvedValue(mockEpochData);
  //   const mockGetMinEpochToProcess = fromPromise(async () => mockEpochData) as any;

  //   const testMachine = createTestMachine(mockGetMinEpochToProcess);

  //   const actor = createActor(testMachine, {
  //     input: {
  //       slotDuration: 12,
  //       lookbackSlot: 32,
  //       epochController: mockEpochController,
  //     },
  //   });

  //   // Act
  //   actor.start();

  //   // Wait for the async operation to complete
  //   await new Promise((resolve) => setTimeout(resolve, 100));

  //   // Assert - Should be in epochProcessorRunning
  //   let snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('epochProcessorRunning');

  //   // Send first EPOCH_COMPLETED event
  //   actor.send({ type: 'EPOCH_COMPLETED', machineId: 'epochProcessor:300' });

  //   // Wait for the event to be processed
  //   await new Promise((resolve) => setTimeout(resolve, 10));

  //   // Should be back to gettingMinEpoch
  //   snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('gettingMinEpoch');

  //   // Send another EPOCH_COMPLETED event while in gettingMinEpoch (should be ignored)
  //   actor.send({ type: 'EPOCH_COMPLETED', machineId: 'epochProcessor:300' });

  //   // Wait a bit
  //   await new Promise((resolve) => setTimeout(resolve, 10));

  //   // Should still be in gettingMinEpoch
  //   snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('gettingMinEpoch');

  //   // Clean up
  //   actor.stop();
  // });

  // test('should handle rapid state transitions correctly', async () => {
  //   // Arrange
  //   const mockEpochData = {
  //     epoch: 400,
  //     validatorsBalancesFetched: false,
  //     rewardsFetched: false,
  //     committeesFetched: false,
  //     slotsFetched: false,
  //     syncCommitteesFetched: false,
  //     validatorsActivationFetched: false,
  //   };

  //   vi.mocked(mockEpochController.getMinEpochToProcess).mockResolvedValue(mockEpochData);
  //   const mockGetMinEpochToProcess = fromPromise(async () => mockEpochData) as any;

  //   const testMachine = createTestMachine(mockGetMinEpochToProcess);

  //   const actor = createActor(testMachine, {
  //     input: {
  //       slotDuration: 12,
  //       lookbackSlot: 32,
  //       epochController: mockEpochController,
  //     },
  //   });

  //   // Act
  //   actor.start();

  //   // Wait for the async operation to complete
  //   await new Promise((resolve) => setTimeout(resolve, 100));

  //   // Assert - Should be in epochProcessorRunning
  //   let snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('epochProcessorRunning');

  //   // Send EPOCH_COMPLETED event immediately
  //   actor.send({ type: 'EPOCH_COMPLETED', machineId: 'epochProcessor:400' });

  //   // Wait for the event to be processed
  //   await new Promise((resolve) => setTimeout(resolve, 10));

  //   // Should be back to gettingMinEpoch
  //   snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('gettingMinEpoch');
  //   expect(snapshot.context.epochData).toBe(null);
  //   expect(snapshot.context.epochActor).toBe(null);

  //   // Clean up
  //   actor.stop();
  // });

  // test('should handle context updates correctly during state transitions', async () => {
  //   // Arrange
  //   const mockEpochData = {
  //     epoch: 500,
  //     validatorsBalancesFetched: true,
  //     rewardsFetched: false,
  //     committeesFetched: true,
  //     slotsFetched: false,
  //     syncCommitteesFetched: true,
  //     validatorsActivationFetched: false,
  //   };

  //   vi.mocked(mockEpochController.getMinEpochToProcess).mockResolvedValue(mockEpochData);
  //   const mockGetMinEpochToProcess = fromPromise(async () => mockEpochData) as any;

  //   const testMachine = createTestMachine(mockGetMinEpochToProcess);

  //   const actor = createActor(testMachine, {
  //     input: {
  //       slotDuration: 6,
  //       lookbackSlot: 16,
  //       epochController: mockEpochController,
  //     },
  //   });

  //   // Act
  //   actor.start();

  //   // Wait for the async operation to complete
  //   await new Promise((resolve) => setTimeout(resolve, 100));

  //   // Assert - Check context is properly set
  //   let snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('epochProcessorRunning');
  //   expect(snapshot.context.epochData).toEqual(mockEpochData);
  //   expect(snapshot.context.slotDuration).toBe(6);
  //   expect(snapshot.context.lookbackSlot).toBe(16);
  //   expect(snapshot.context.epochActor).not.toBe(null);

  //   // Send EPOCH_COMPLETED event
  //   actor.send({ type: 'EPOCH_COMPLETED', machineId: 'epochProcessor:500' });

  //   // Wait for the event to be processed
  //   await new Promise((resolve) => setTimeout(resolve, 10));

  //   // Assert - Context should be cleaned
  //   snapshot = actor.getSnapshot();
  //   expect(snapshot.value).toBe('gettingMinEpoch');
  //   expect(snapshot.context.epochData).toBe(null);
  //   expect(snapshot.context.epochActor).toBe(null);
  //   // Other context should remain
  //   expect(snapshot.context.slotDuration).toBe(6);
  //   expect(snapshot.context.lookbackSlot).toBe(16);

  //   // Clean up
  //   actor.stop();
  // });
});
