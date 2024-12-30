import { describe, it, expect, vi, beforeEach } from "vitest";

// mocks
vi.mock("@/src/telegram/utils/messaging.js", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("@/src/prisma/users.js", () => ({
  updateUserById_db: vi.fn(),
  getOpenIncident_db: vi.fn(),
  createIncident_db: vi.fn(),
  updateIncidentData_db: vi.fn(),
  closeIncident_db: vi.fn(),
}));

vi.mock("@/src/utils/misc.js", () => ({
  isNotificationAllowed: vi.fn(),
}));

// imports
import { processUserPerformance } from "@/src/scheduler/tasks/utils/processUserPerformance.js";
import { sendMessage } from "@/src/telegram/utils/messaging.js";
import {
  updateUserById_db,
  getOpenIncident_db,
  createIncident_db,
  updateIncidentData_db,
  closeIncident_db,
} from "@/src/prisma/users.js";
import { isNotificationAllowed } from "@/src/utils/misc.js";
import { IncidentType } from "@/src/types.js";
import { User } from "@prisma/client";

describe("processUserPerformance", () => {
  const user: User = {
    id: BigInt(1),
    chatId: BigInt(12345),
    performanceNotif: new Date(),
    performanceThreshold: 90,
    internalId: "internalId",
  } as User;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should do nothing if performance >= performanceThreshold and no open incident", async () => {
    await processUserPerformance(user, user.performanceThreshold + 5);
    expect(closeIncident_db).not.toHaveBeenCalled();
    expect(createIncident_db).not.toHaveBeenCalled();
  });

  it("should close open incident if performance >= performanceThreshold", async () => {
    const openIncident = { id: 1 };
    (getOpenIncident_db as any).mockResolvedValue(openIncident);

    await processUserPerformance(user, user.performanceThreshold + 5);

    expect(closeIncident_db).toHaveBeenCalledWith(openIncident.id);
  });

  it("should create a new incident if performance < performanceThreshold and no open incident", async () => {
    (getOpenIncident_db as any).mockResolvedValue(null);
    const performance = user.performanceThreshold - 5;

    await processUserPerformance(user, performance);

    expect(createIncident_db).toHaveBeenCalledWith(
      user.internalId,
      IncidentType.PERFORMANCE,
      {
        currentPerformance: performance,
        threshold: user.performanceThreshold,
      }
    );
  });

  it("should update incident if performance < performanceThreshold and open incident with higher currentPerformance", async () => {
    const openIncident = {
      id: 1,
      data: { currentPerformance: user.performanceThreshold - 30 },
    };
    (getOpenIncident_db as any).mockResolvedValue(openIncident);
    const performance = openIncident.data.currentPerformance - 5;

    await processUserPerformance(user, performance);

    expect(updateIncidentData_db).toHaveBeenCalledWith(openIncident.id, {
      currentPerformance: performance,
      threshold: user.performanceThreshold,
    });
  });

  it("should not update incident if performance < performanceThreshold and open incident with lower currentPerformance", async () => {
    const openIncident = {
      id: 1,
      data: { currentPerformance: user.performanceThreshold - 20 },
    };
    (getOpenIncident_db as any).mockResolvedValue(openIncident);

    await processUserPerformance(
      user,
      openIncident.data.currentPerformance + 5
    );

    expect(updateIncidentData_db).not.toHaveBeenCalled();
  });

  it("should not send notification if not allowed", async () => {
    (isNotificationAllowed as any).mockReturnValue(false);
    await processUserPerformance(user, user.performanceThreshold - 10);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("should send notification if allowed", async () => {
    (isNotificationAllowed as any).mockReturnValue(true);

    await processUserPerformance(user, user.performanceThreshold - 20);

    expect(sendMessage).toHaveBeenCalledWith(
      user.chatId.toString(),
      `⚠️ Your validators performance has fallen below the threshold of ${user.performanceThreshold}%!`,
      expect.any(Object)
    );
    expect(updateUserById_db).toHaveBeenCalledWith(Number(user.id), {
      performanceNotif: expect.any(Date),
    });
  });
});
