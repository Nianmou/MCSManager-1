import { randomUUID } from "crypto";
import { performance } from "perf_hooks";
import type Instance from "../entity/instance/instance";
import { pamExchange, type PamDelivery } from "./pam_protocol";

export function parseRestartNotice(payload: string): { seconds: number; message: string } {
  if (typeof payload !== "string" || payload.length > 1400) throw new Error("Invalid restart reminder");
  const value = JSON.parse(payload);
  if (!value || !Number.isInteger(value.seconds) || value.seconds < 10 || value.seconds > 3600 ||
      typeof value.message !== "string" || !value.message.trim() || value.message.length > 200 ||
      /[\x00-\x1f\x7f-\x9f]/.test(value.message)) throw new Error("Invalid restart reminder");
  return { seconds: value.seconds, message: value.message };
}

const active = new Set<string>();
export async function scheduledRestartNotice(instance: Instance, payload: string, deliver?: PamDelivery,
  now = () => performance.now()) {
  const { seconds, message } = parseRestartNotice(payload);
  if (active.has(instance.instanceUuid) || active.size >= 64) throw new Error("Restart notification already active or capacity reached");
  if (instance.status() !== 3 || !instance.config.enableRcon) throw new Error("Running instance with configured RCON required");
  active.add(instance.instanceUuid);
  const controller = new AbortController(), taskId = randomUUID();
  const generation = instance.startCount, startedAt = instance.startTimestamp;
  let dispatched = false;
  const abort = () => controller.abort();
  const continuous = () => !controller.signal.aborted && instance.status() === 3 &&
    instance.startCount === generation && instance.startTimestamp === startedAt;
  const check = () => { if (!continuous()) throw new Error("Instance changed during notification"); };
  for (const event of ["exit", "open", "failure"]) instance.on(event, abort);
  const exchange = (action: "begin" | "status" | "cancel", signal = controller.signal) =>
    pamExchange(instance, "PAM_RESTART_NOTICE ",
      (request) => `pam_restart_notice ${action} ${taskId} ${request}` +
        (action === "begin" ? ` ${seconds} ${Buffer.from(message, "utf8").toString("base64url")}` : ""),
      (ack) => ack.taskId === taskId && ack.action === action && typeof ack.state === "string" &&
        Number.isFinite(ack.remainingMs) && ack.remainingMs >= 0 && ack.remainingMs <= 3600000,
      signal, deliver);
  const wait = (ms: number) => new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new Error("Instance changed during countdown")); };
    const timer = setTimeout(() => { controller.signal.removeEventListener("abort", cancel); resolve(); }, ms);
    controller.signal.addEventListener("abort", cancel, { once: true });
    if (controller.signal.aborted) cancel();
  });
  try {
    const begin = await exchange("begin");
    check();
    if (begin.state !== "countdown") throw new Error(`Plugin rejected reminder: ${begin.state}`);
    const deadline = now() + seconds * 1000;
    while (now() < deadline) {
      await wait(Math.min(5000, deadline - now()));
      check();
      const status = await exchange("status");
      check();
      if (!["countdown", "ready"].includes(status.state)) throw new Error(`Plugin reminder lost: ${status.state}`);
    }
    const final = await exchange("status");
    check();
    if (final.state !== "ready") throw new Error("Plugin did not reach restart deadline");
    // No await between the last continuity check and dispatch: never repeat a restart.
    dispatched = true;
    await instance.execPreset("restart");
  } finally {
    for (const event of ["exit", "open", "failure"]) instance.off(event, abort);
    if (!dispatched && instance.status() === 3 && instance.startCount === generation && instance.startTimestamp === startedAt) {
      try { await exchange("cancel", new AbortController().signal); } catch { /* TTL clears unreachable HUD. */ }
    }
    controller.abort(); active.delete(instance.instanceUuid);
  }
}
