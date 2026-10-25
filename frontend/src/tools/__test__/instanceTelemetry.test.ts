import { describe, expect, it } from "vitest";
import { instanceTelemetry } from "../instanceTelemetry";
import type { InstanceDetail } from "@/types";
describe("instance runtime presentation", () => {
  const fixture = { status: 3, info: { cs2: { state: "available", checkedAt: 1000,
    players: 0, pluginVersion: "2.0.0.11", platformVersion: "1.5.0" } } } as InstanceDetail;
  it("shows confirmed zero and both loaded versions", () => {
    expect(instanceTelemetry(fixture, 2000)).toEqual({ players: "0", pluginVersion: "2.0.0.11", platformVersion: "1.5.0", addonsManager: "unknown", addonsManagerVersion: undefined });
  });
  it("does not fabricate counts or retain versions after stop, staleness or failed query", () => {
    for (const value of [undefined, { ...fixture, status: 0 },
      { ...fixture, info: { cs2: { state: "unavailable", checkedAt: 1000 } } }]) {
      expect(instanceTelemetry(value as InstanceDetail, 2000).players).toBeUndefined();
      expect(instanceTelemetry(value as InstanceDetail, 2000).pluginVersion).toBeUndefined();
    }
    expect(instanceTelemetry(fixture, 32000).players).toBeUndefined();
  });
  it("retains Minecraft count support", () => {
    expect(instanceTelemetry({ status: 3, info: { mcPingOnline: true, currentPlayers: 4, maxPlayers: 20 } } as InstanceDetail).players).toBe("4 / 20");
  });
});
