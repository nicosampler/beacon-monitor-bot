import { describe, it, expect, vi, beforeEach } from "vitest";

// mocks
vi.mock("@/src/env.js", () => ({
  env: {
    BEACON_DELAY_SLOTS_TO_HEAD: 2,
    BEACON_MAX_ATTESTATION_DELAY: 5,
  },
}));

vi.mock("@/src/prisma/slot.js", () => ({
  getLastSlotWithAttestations_db: vi.fn(),
}));

vi.mock("@/src/utils/time.js", () => ({
  getSlotNumberFromTimestamp: vi.fn().mockReturnValue(1_000_000),
}));

// imports
import { getSlotInfo } from "../getSlotInfo.js";
import { getLastSlotWithAttestations_db } from "@/src/prisma/slot.js";
import { env } from "@/src/env.js";

const currentSlot = 1_000_000;

describe("getSlotInfo", () => {
  const mockedGetLastSlotWithAttestations = vi.mocked(
    getLastSlotWithAttestations_db
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return syncing=true when far behind", async () => {
    const delay = 8;
    mockedGetLastSlotWithAttestations.mockResolvedValue({
      slot: currentSlot - delay,
      attestationsFetched: true,
      blockAndSyncRewardsFetched: true,
    });

    const result = await getSlotInfo();
    expect(result.syncing).toEqual(true);
  });

  it("should return syncing=false when not far behind", async () => {
    const delay = 7;
    mockedGetLastSlotWithAttestations.mockResolvedValue({
      slot: currentSlot - delay,
      attestationsFetched: true,
      blockAndSyncRewardsFetched: true,
    });

    const result = await getSlotInfo();
    expect(result.syncing).toEqual(false);
  });

  it("should return the correct maxSlotToQuery", async () => {
    const delay = 8;
    mockedGetLastSlotWithAttestations.mockResolvedValue({
      slot: currentSlot - delay,
      attestationsFetched: true,
      blockAndSyncRewardsFetched: true,
    });

    const result = await getSlotInfo();

    expect(result.maxSlotToQuery).toEqual(
      currentSlot -
        env.BEACON_DELAY_SLOTS_TO_HEAD -
        env.BEACON_MAX_ATTESTATION_DELAY
    );
  });

  it("should return the correct delay value", async () => {
    const delay = 12;
    mockedGetLastSlotWithAttestations.mockResolvedValue({
      slot: currentSlot - delay,
      attestationsFetched: true,
      blockAndSyncRewardsFetched: true,
    });

    const result = await getSlotInfo();

    expect(result.delay).toEqual(currentSlot - (currentSlot - delay));
  });
});
