import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Instance from "../../entity/instance/instance";
import { PamLineParser, pamExchange, sendPamRcon, type PamDelivery } from "../pam_protocol";
import { queryCs2Runtime } from "../cs2_runtime";
import { parseRestartNotice, scheduledRestartNotice } from "../scheduled_restart_notice";
import Cs2RuntimeTask from "../../entity/commands/task/cs2_runtime";

const payload = JSON.stringify({ seconds: 15, message: "Server restarting" });
function fixture() {
  return Object.assign(new EventEmitter(), { instanceUuid: "instance", startCount: 1, startTimestamp: 10,
    config: { enableRcon: true, rconPort: 27015, rconPassword: "secret" }, info: {},
    status: vi.fn(() => 3), execPreset: vi.fn(async () => {}) }) as unknown as Instance;
}
function transport(patch: (action: string) => object = () => ({})): PamDelivery {
  return async (instance, command) => {
    const parts = command.split(" ");
    if (parts[0] === "pam_server_status") {
      instance.emit("data", "PAM_SERVER_STATUS " + JSON.stringify({ v: 1, requestId: parts[1],
        players: 0, pluginVersion: "2.0.0.11", platformVersion: "1.5.0" }) + "\n");
    } else {
      const [, action, taskId, requestId] = parts;
      instance.emit("data", "PAM_RESTART_NOTICE " + JSON.stringify({ v: 1, taskId, requestId, action,
        state: action === "begin" ? "countdown" : "ready", remainingMs: 0, ...patch(action) }) + "\n");
    }
  };
}
afterEach(() => vi.useRealTimers());
describe("bounded authenticated PAM protocol", () => {
  it.each([undefined, null, [], { state: "loaded", version: {} },
    { state: "loaded", version: "x".repeat(97) }, { state: "loaded", version: "bad\nversion" },
    { state: "loaded", version: "\u0085" }, { state: "invalid" },
    { state: "loaded", version: " " }])("preserves valid telemetry with invalid optional metadata %j", async (addonsManager) => {
    const result = await queryCs2Runtime(fixture(), new AbortController().signal, async (instance, command) => {
      instance.emit("data", "PAM_SERVER_STATUS " + JSON.stringify({ v: 1, requestId: command.split(" ")[1],
        players: 2, pluginVersion: "2.0.0.15", platformVersion: "1.5.0", addonsManager }) + "\n");
    });
    expect(result).toMatchObject({ players: 2, pluginVersion: "2.0.0.15", addonsManager: { state: "unknown" } });
  });
  it.each([{ state: "loaded", version: "v1.2.3 beta" }, { state: "not_loaded" }])("accepts optional registry metadata %j", async (addonsManager) => {
    const result = await queryCs2Runtime(fixture(), new AbortController().signal, async (instance, command) => {
      instance.emit("data", "PAM_SERVER_STATUS " + JSON.stringify({ v: 1, requestId: command.split(" ")[1],
        players: 2, pluginVersion: "2.0.0.15", platformVersion: "1.5.0", addonsManager }) + "\n");
    });
    expect(result.addonsManager).toEqual(addonsManager);
  });
  it("handles fragments, ConPTY wrapping and ANSI, ignores chat and oversized lines", () => {
    const values: object[] = [], parser = new PamLineParser("PAM_SERVER_STATUS ", (v) => values.push(v));
    parser.push('player: PAM_SERVER_STATUS {"v":1}\n');
    parser.push("x".repeat(5000)); parser.push('\n');
    parser.push('\x1b[0KPAM_SERVER_'); parser.push('STATUS {"v":1,\r\n'); parser.push('"players":0}\n');
    expect(values).toEqual([{ v: 1, players: 0 }]);
  });
  it("subscribes before delivery and reports a confirmed zero count with loaded versions", async () => {
    const instance = fixture();
    const result = await queryCs2Runtime(instance, new AbortController().signal, transport());
    expect(result).toMatchObject({ state: "available", players: 0, pluginVersion: "2.0.0.11", platformVersion: "1.5.0" });
    expect(instance.listenerCount("data")).toBe(0);
  });
  it("ignores mismatched nonce/version and times out without leaking subscription", async () => {
    vi.useFakeTimers(); const instance = fixture();
    const request = pamExchange(instance, "PAM_SERVER_STATUS ", (id) => `pam_server_status ${id}`, () => true,
      new AbortController().signal, async (inst, cmd) => {
        inst.emit("data", 'PAM_SERVER_STATUS {"v":1,"requestId":"wrong"}\n');
        inst.emit("data", `PAM_SERVER_STATUS ${JSON.stringify({ v: 2, requestId: cmd.split(" ")[1] })}\n`);
      });
    const rejected = expect(request).rejects.toThrow("confirmation timed out");
    await vi.advanceTimersByTimeAsync(6000); await rejected;
    expect(instance.listenerCount("data")).toBe(0);
  });
  it("aborts pending observations when lifecycle stops, leaving unavailable rather than stale zero", async () => {
    const instance = fixture(), task = new Cs2RuntimeTask();
    await task.start(instance); await task.stop(instance);
    expect(instance.info.cs2?.state).toBe("unavailable");
    expect(instance.listenerCount("data")).toBe(0);
  });
  it("validates RCON configuration and machine command boundary before connecting", async () => {
    const instance = fixture(); instance.config.enableRcon = false;
    await expect(sendPamRcon(instance, "pam_server_status test", new AbortController().signal)).rejects.toThrow("not configured");
    instance.config.enableRcon = true;
    await expect(sendPamRcon(instance, "pam_server_status id;quit", new AbortController().signal)).rejects.toThrow("Invalid protocol");
  });
});
describe("scheduled notified restart", () => {
  it("requires a bounded message and 10–3600 integral seconds", () => {
    expect(parseRestartNotice(payload).seconds).toBe(15);
    for (const seconds of [9, 3601, 10.1, "15"]) expect(() => parseRestartNotice(JSON.stringify({ seconds, message: "test" }))).toThrow();
    expect(() => parseRestartNotice(JSON.stringify({ seconds: 15, message: "bad\n" }))).toThrow();
  });
  it("waits the complete 15 seconds after confirmation and dispatches exactly once", async () => {
    vi.useFakeTimers();
    const instance = fixture(), run = scheduledRestartNotice(instance, payload, transport(), () => Date.now());
    await vi.advanceTimersByTimeAsync(14999); expect(instance.execPreset).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await run;
    expect(instance.execPreset).toHaveBeenCalledTimes(1);
    expect(instance.execPreset).toHaveBeenCalledWith("restart"); expect(instance.eventNames()).toEqual([]);
  });
  it("never restarts on plugin conflict and releases the per-instance lock", async () => {
    const instance = fixture();
    for (let i = 0; i < 2; i++) await expect(scheduledRestartNotice(instance, payload, transport(() => ({ state: "conflict" })))).rejects.toThrow("rejected");
    expect(instance.execPreset).not.toHaveBeenCalled(); expect(instance.eventNames()).toEqual([]);
  });
  it("rejects overlapping runs and stops on a manual restart, canceling the old reminder", async () => {
    vi.useFakeTimers(); const instance = fixture();
    const delivery = vi.fn(transport());
    const result = expect(scheduledRestartNotice(instance, payload, delivery)).rejects.toThrow("changed");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(scheduledRestartNotice(instance, payload, delivery)).rejects.toThrow("already active");
    instance.emit("open"); await result;
    expect(instance.execPreset).not.toHaveBeenCalled(); expect(instance.eventNames()).toEqual([]);
    expect(delivery.mock.calls.some(([, cmd]) => cmd.includes(" cancel "))).toBe(true);
  });
  it("skips an unconfirmed begin, cleans waiters and never restarts", async () => {
    vi.useFakeTimers(); const instance = fixture();
    const rejection = expect(scheduledRestartNotice(instance, payload, async () => {})).rejects.toThrow("confirmation timed out");
    await vi.advanceTimersByTimeAsync(12000); await rejection;
    expect(instance.execPreset).not.toHaveBeenCalled(); expect(instance.eventNames()).toEqual([]);
  });
  it("rechecks plugin health and process generation before dispatch", async () => {
    vi.useFakeTimers(); const instance = fixture();
    const rejected = expect(scheduledRestartNotice(instance, payload, transport((action) => action === "status" ? { state: "none" } : {}))).rejects.toThrow("lost");
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(instance.execPreset).not.toHaveBeenCalled(); expect(instance.eventNames()).toEqual([]);
  });
});
