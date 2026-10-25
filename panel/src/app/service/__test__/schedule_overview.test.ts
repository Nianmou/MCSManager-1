import { describe, expect, it, vi } from "vitest";
import { listNodeSchedules } from "../schedule_overview";

describe("schedule overview compatibility", () => {
  it("reads existing plans without requiring schedule/list_all on a legacy node", async () => {
    const request = vi.fn(async (event, data) => {
      if (event === "instance/overview") return [{ instanceUuid: "game" }];
      if (event === "schedule/list") return [{ name: "restart", time: "60" }];
      throw new Error("Unsupported route");
    });
    expect(await listNodeSchedules({ request: request as any })).toEqual({
      tasks: [{ instanceUuid: "game", name: "restart", time: "60" }]
    });
    expect(request).toHaveBeenCalledWith("schedule/list", { instanceUuid: "game" });
    expect(request).not.toHaveBeenCalledWith("schedule/list_all", expect.anything());
  });

  it("keeps successful plans and reports failures separately from empty schedules", async () => {
    const request = vi.fn(async (event, data) => {
      if (event === "instance/overview")
        return ["ok", "empty", "failed", "invalid"].map((instanceUuid) => ({ instanceUuid }));
      if (data.instanceUuid === "failed") throw new Error("timeout");
      if (data.instanceUuid === "invalid") return {};
      return data.instanceUuid === "empty" ? [] : [{ name: "restart" }];
    });
    expect(await listNodeSchedules({ request: request as any })).toEqual({
      tasks: [{ name: "restart", instanceUuid: "ok" }], error: true
    });
  });

  it("reads every instance while limiting concurrent requests", async () => {
    let active = 0;
    let peak = 0;
    const request = vi.fn(async (event, data) => {
      if (event === "instance/overview")
        return Array.from({ length: 61 }, (_, i) => ({ instanceUuid: String(i) }));
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return [{ name: data.instanceUuid }];
    });
    const result = await listNodeSchedules({ request: request as any });
    expect(result.tasks).toHaveLength(61);
    expect(peak).toBeLessThanOrEqual(5);
    expect(result.error).toBeUndefined();
  });

  it("propagates an unavailable instance list to the route's node error handler", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(listNodeSchedules({ request })).rejects.toThrow("offline");
  });

  it("accepts a node without instances", async () => {
    const request = vi.fn().mockResolvedValue([]);
    expect(await listNodeSchedules({ request })).toEqual({ tasks: [] });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
