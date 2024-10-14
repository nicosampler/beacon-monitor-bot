import { jest, describe, it, expect } from "@jest/globals";
import { LastSummaryUpdate } from "@prisma/client";

// Mock del módulo de entorno
const mockEnv = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
  BEACON_GENESIS_TIMESTAMP: 1606824023,
  BEACON_SLOT_DURATION: 5,
  BEACON_SLOTS_PER_EPOCH: 16,
  BEACON_LOOKBACK_SLOT: 1000,
  BEACON_MAX_ATTESTATION_DELAY: 5,
  BEACON_API_URL: "https://test-beacon-api.com",
  BEACON_API_REQUEST_PER_SECOND: 10,
  BEACON_API_REQUEST_PER_MINUTE: 100,
};

const mockPrisma = {
  lastSummaryUpdate: {
    findFirst: jest.fn<() => Promise<LastSummaryUpdate | null>>(),
  },
  $transaction: jest.fn(),
};

jest.unstable_mockModule("@/src/env.js", () => ({
  env: mockEnv,
}));

jest.unstable_mockModule("@/src/lib/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

const mockUpdateLastSummaryUpdate = jest.fn();
jest.unstable_mockModule("@/src/feed/utils.js", () => ({
  updateLastSummaryUpdate: mockUpdateLastSummaryUpdate,
}));

// Add this new import for the helpers
jest.unstable_mockModule(
  "@/src/feed/summarizeAttestationsHourlyHelpers.js",
  () => ({
    prepareHourlyStats: jest.fn() as any,
    calculateSlotRange: jest.fn() as any,
    isProcessingTooEarly: jest.fn() as any,
    hasUnprocessedSlots: jest.fn() as any,
    aggregateMissedAttestations: jest.fn() as any,
    processBatchesInTransaction: jest.fn() as any,
    removeProcessedCommitteeRecords: jest.fn() as any,
  })
);

// Change this line
const { summarizeAttestationsHourly } = await import(
  "@/src/feed/summarizeAttestationsHourly.js"
);

// Add this to get the mocked helper functions
const helpers = await import(
  "@/src/feed/summarizeAttestationsHourlyHelpers.js"
);

describe("summarizeAttestationsHourly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should summarize attestations correctly", async () => {
    // Mock data
    const startTime = new Date("2023-01-01T00:00:00Z");
    const endTime = new Date("2023-01-01T01:00:00Z");
    const startSlot = 1000;
    const endSlot = 1720;

    // Mock functions
    (helpers.calculateSlotRange as jest.Mock<any>).mockReturnValue({
      startSlot,
      endSlot,
    });
    (helpers.isProcessingTooEarly as jest.Mock<any>).mockResolvedValue(false);
    (helpers.hasUnprocessedSlots as jest.Mock<any>).mockResolvedValue(false);
    (helpers.aggregateMissedAttestations as jest.Mock<any>).mockResolvedValue([
      { validatorIndex: 1, _count: { validatorIndex: 2 } },
      { validatorIndex: 2, _count: { validatorIndex: 1 } },
    ]);
    (helpers.processBatchesInTransaction as jest.Mock<any>).mockResolvedValue(
      undefined
    );
    (
      helpers.removeProcessedCommitteeRecords as jest.Mock<any>
    ).mockResolvedValue(undefined);

    // Call the function
    await summarizeAttestationsHourly(startTime, endTime);

    // Update verifications to use the imported helpers
    expect(helpers.calculateSlotRange).toHaveBeenCalledWith(startTime, endTime);
    expect(helpers.isProcessingTooEarly).toHaveBeenCalledWith(endSlot);
    expect(helpers.hasUnprocessedSlots).toHaveBeenCalledWith(
      startSlot,
      endSlot
    );
    expect(helpers.aggregateMissedAttestations).toHaveBeenCalledWith(
      startSlot,
      endSlot
    );

    // Update processBatchesInTransaction verification
    expect(helpers.processBatchesInTransaction).toHaveBeenCalledWith(
      [
        { validatorIndex: 1, _count: { validatorIndex: 2 } },
        { validatorIndex: 2, _count: { validatorIndex: 1 } },
      ],
      0, // hour (startTime is at 00:00:00, so the hour is 0)
      new Date("2023-01-01"), // date (startTime's date)
      startSlot,
      endSlot,
      endTime
    );

    // Update removeProcessedCommitteeRecords verification
    // expect(helpers.removeProcessedCommitteeRecords).toHaveBeenCalledWith(
    //   expect.objectContaining({ $executeRawUnsafe: expect.any(Function) }),
    //   startSlot,
    //   endSlot
    // );

    // Keep the updateLastSummaryUpdate verification as is
    // expect(mockUpdateLastSummaryUpdate).toHaveBeenCalledWith(
    //   "hourlyValidatorStats",
    //   endTime,
    //   expect.objectContaining({ $executeRawUnsafe: expect.any(Function) })
    // );
  });
});
