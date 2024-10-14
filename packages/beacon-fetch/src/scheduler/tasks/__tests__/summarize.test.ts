import { jest, describe, it, expect } from "@jest/globals";
import { LastSummaryUpdate } from "@prisma/client";
import { addHours, addSeconds } from "date-fns";

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

jest.unstable_mockModule("@/src/env.js", () => ({
  env: mockEnv,
}));

const mockPrisma = {
  lastSummaryUpdate: {
    findFirst: jest.fn<() => Promise<LastSummaryUpdate | null>>(),
  },
  $transaction: jest.fn(),
};
jest.unstable_mockModule("@/src/lib/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

// Mock summarizeAttestationsHourly
const mockSummarizeAttestationsHourly = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("@/src/feed/summarizeAttestationsHourly.js", () => ({
  summarizeAttestationsHourly: mockSummarizeAttestationsHourly,
}));

const { summarizeAttestationsHourlyTask } = await import("../summarize.js");
const { getTimestampFromSlotNumber } = await import(
  "@/src/beacon/utils/time.js"
);

describe("summarizeAttestationsHourlyTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSummarizeAttestationsHourly.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should call summarizeAttestationsHourly with correct dates when lastSummaryUpdate exists", async () => {
    const lastUpdate = new Date("2023-01-01T00:00:00Z");
    mockPrisma.lastSummaryUpdate.findFirst.mockResolvedValue({
      hourlyValidatorStats: lastUpdate,
    } as LastSummaryUpdate);

    const expectedStart = new Date("2023-01-01T00:00:00Z");
    const expectedEnd = new Date("2023-01-01T01:00:00Z");

    jest.setSystemTime(new Date("2023-01-01T02:00:00Z"));

    await summarizeAttestationsHourlyTask();

    expect(mockSummarizeAttestationsHourly).toHaveBeenCalledWith(
      expectedStart,
      expectedEnd
    );
  });

  it("should use BEACON_LOOKBACK_SLOT when lastSummaryUpdate doesn't exist", async () => {
    mockPrisma.lastSummaryUpdate.findFirst.mockResolvedValue(null);

    const expectedStart = new Date(
      getTimestampFromSlotNumber(mockEnv.BEACON_LOOKBACK_SLOT)
    );
    const expectedEnd = addHours(expectedStart, 1);

    jest.setSystemTime(
      addSeconds(
        expectedEnd,
        mockEnv.BEACON_API_REQUEST_PER_SECOND * mockEnv.BEACON_SLOTS_PER_EPOCH +
          1
      )
    );

    await summarizeAttestationsHourlyTask();

    expect(mockSummarizeAttestationsHourly).toHaveBeenCalledWith(
      expectedStart,
      expectedEnd
    );
  });

  it("should skip if the end time is in the future", async () => {
    const lastUpdate = new Date();
    mockPrisma.lastSummaryUpdate.findFirst.mockResolvedValue({
      hourlyValidatorStats: lastUpdate,
    } as LastSummaryUpdate);

    jest.setSystemTime(new Date(lastUpdate.getTime() + 1800000)); // 30 minutes after lastUpdate

    await summarizeAttestationsHourlyTask();

    expect(mockSummarizeAttestationsHourly).not.toHaveBeenCalled();
  });
});
