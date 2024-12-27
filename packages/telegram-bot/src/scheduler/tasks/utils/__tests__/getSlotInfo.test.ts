import { describe, it, expect, vi, beforeEach } from "vitest";

// 1. First declare vi mock implementations
vi.mock("@/src/env.js", () => ({
  env: {
    BEACON_DELAY_SLOTS_TO_HEAD: 4,
    BEACON_SLOTS_PER_EPOCH: 32,
  },
}));

vi.mock("@/src/prisma/slot.js", () => ({
  getLastSlotWithAttestations_db: vi.fn(),
}));

vi.mock("@/src/utils/time.js", () => ({
  getSlotNumberFromTimestamp: vi.fn().mockReturnValue(1_000_000),
}));

// 2. Then import everything else
import { getSlotInfo } from "../getSlotInfo.js";
import { getLastSlotWithAttestations_db } from "@/src/prisma/slot.js";
import { env } from "@/src/env.js";

// 3. Constants can go here
const currentSlot = 1_000_000;

describe("getSlotInfo", () => {
  const mockedGetLastSlotWithAttestations = vi.mocked(
    getLastSlotWithAttestations_db
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return syncing=true when far behind", async () => {
    // Simulate being 100 slots behind
    mockedGetLastSlotWithAttestations.mockResolvedValue({
      slot: currentSlot - 100,
      attestationsFetched: true,
      blockAndSyncRewardsFetched: true,
    });

    const result = await getSlotInfo();

    expect(result.headSlot).toEqual(
      currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD
    );
    expect(result.maxSlotToQuery).toEqual(
      currentSlot - env.BEACON_DELAY_SLOTS_TO_HEAD - env.BEACON_SLOTS_PER_EPOCH
    );
    expect(result.syncing).toEqual(true);
  });

  // it("should return syncing=false when up to date", async () => {
  //   mockedGetLastSlotWithAttestations.mockResolvedValue({
  //     slot: expectedMaxSlotToQuery,
  //     attestationsFetched: true,
  //     blockAndSyncRewardsFetched: true,
  //   });

  //   const result = await getSlotInfo();

  //   expect(result).toEqual({
  //     headSlot: expectedMaxSlotToQuery,
  //     maxSlotToQuery: expectedMaxSlotToQuery,
  //     maxEpochToQuery: Math.floor(expectedMaxSlotToQuery / 32),
  //     syncing: false,
  //   });
  // });

  // it("should return syncing=false when ahead", async () => {
  //   mockedGetLastSlotWithAttestations.mockResolvedValue({
  //     slot: expectedMaxSlotToQuery + 10,
  //     attestationsFetched: true,
  //     blockAndSyncRewardsFetched: true,
  //   });

  //   const result = await getSlotInfo();

  //   expect(result).toEqual({
  //     headSlot: expectedMaxSlotToQuery,
  //     maxSlotToQuery: expectedMaxSlotToQuery,
  //     maxEpochToQuery: Math.floor(expectedMaxSlotToQuery / 32),
  //     syncing: false,
  //   });
  // });
});
