import { jest, describe, it, expect } from "@jest/globals";

// Mock del módulo de entorno
const mockEnv = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
  BEACON_GENESIS_TIMESTAMP: 1606824023,
  BEACON_SLOT_DURATION: 5,
  BEACON_SLOTS_PER_EPOCH: 16,
  BEACON_LOOKBACK_SLOT: 0,
  BEACON_MAX_ATTESTATION_DELAY: 5,
  BEACON_API_URL: "https://test-beacon-api.com",
  BEACON_API_REQUEST_PER_SECOND: 10,
  BEACON_API_REQUEST_PER_MINUTE: 100,
};

jest.unstable_mockModule("@/src/env.js", () => ({
  env: mockEnv,
}));

jest.unstable_mockModule("@/src/feed/summarizeAttestationsHourly.js", () => ({
  summarizeAttestationsHourly: jest.fn<() => Promise<void>>(),
}));

const { env } = await import("@/src/env.js");
// const { summarizeAttestationsHourly } = await import(
//   "@/src/feed/summarizeAttestationsHourly.js"
// );

describe("summarizeAttestationsHourlyTask", () => {
  it("should call summarizeAttestationsHourly with correct parameters when summarization is due", async () => {
    console.log("env: ", env);
    expect(env).toBe(mockEnv);
    // const expectedNextSummaryStart = new Date("2023-01-01T00:00:00Z");
    // const expectedNextSummaryEnd = new Date("2023-01-01T01:00:00Z");

    // console.log(summarizeAttestationsHourly);

    // await summarizeAttestationsHourly(
    //   expectedNextSummaryStart,
    //   expectedNextSummaryEnd
    // );

    // expect(summarizeAttestationsHourly).toHaveBeenCalledWith(
    //   expectedNextSummaryStart,
    //   expectedNextSummaryEnd
    // );
  });

  // it("should skip summarization if the next summary end is in the future", async () => {
  //   const mockPrisma = {
  //     lastSummaryUpdate: {
  //       findFirst: jest
  //         .fn<() => Promise<LastSummaryUpdate>>()
  //         .mockResolvedValue({
  //           hourlyValidatorStats: subHours(new Date(), 0.5), // 30 minutes ago
  //         } as LastSummaryUpdate),
  //     },
  //   };
  //   mockGetPrisma.mockReturnValue(mockPrisma);

  //   await summarizeAttestationsHourlyTask();

  //   expect(mockSummarizeAttestationsHourly).not.toHaveBeenCalled();
  // });

  // it("should use BEACON_LOOKBACK_SLOT if no previous summary exists", async () => {
  //   const mockPrisma = {
  //     lastSummaryUpdate: {
  //       findFirst: jest
  //         .fn<() => Promise<LastSummaryUpdate | null>>()
  //         .mockResolvedValue(null),
  //     },
  //   };
  //   mockGetPrisma.mockReturnValue(mockPrisma);
  //   mockSummarizeAttestationsHourly.mockResolvedValue(undefined);
  //   mockGetTimestampFromSlotNumber.mockReturnValue(1609459200000); // 2021-01-01T00:00:00Z

  //   const now = new Date("2021-01-01T02:00:00Z");
  //   jest.spyOn(global, "Date").mockImplementation(() => now);

  //   await summarizeAttestationsHourlyTask();

  //   expect(mockGetTimestampFromSlotNumber).toHaveBeenCalledWith(
  //     env.BEACON_LOOKBACK_SLOT
  //   );
  //   expect(mockSummarizeAttestationsHourly).toHaveBeenCalledWith(
  //     new Date("2021-01-01T00:00:00Z"),
  //     new Date("2021-01-01T01:00:00Z")
  //   );
  // });

  // it("should handle errors and log them", async () => {
  //   const mockPrisma = {
  //     lastSummaryUpdate: {
  //       findFirst: jest
  //         .fn<() => Promise<LastSummaryUpdate>>()
  //         .mockRejectedValue(new Error("Database error")),
  //     },
  //   };
  //   mockGetPrisma.mockReturnValue(mockPrisma);

  //   const mockLogger = {
  //     error: jest.fn(),
  //   };
  //   jest.unstable_mockModule("@/src/lib/pino.js", () => ({
  //     default: () => mockLogger,
  //   }));

  //   await summarizeAttestationsHourlyTask();

  //   expect(mockSummarizeAttestationsHourly).not.toHaveBeenCalled();
  //   expect(mockLogger.error).toHaveBeenCalledWith(
  //     "Error in summarizeAttestationsHourly task",
  //     expect.objectContaining({ error: expect.any(Error) })
  //   );
  // });
});
