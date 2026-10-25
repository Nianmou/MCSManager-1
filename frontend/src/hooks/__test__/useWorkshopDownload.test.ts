import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useWorkshopDownload } from "../useWorkshopDownload";
import type { InstanceDetail } from "@/types";
import type { WorkshopTarget } from "@/services/apis/workshop";
vi.mock("@/services/apis/workshop", () => ({ readWorkshopInstance: vi.fn(), requestWorkshopDownload: vi.fn() }));
const a = "a".repeat(32), b = "b".repeat(32), c = "c".repeat(32);
const target = (daemonId = a, instanceUuid = b) => ({ daemonId, instanceUuid });
afterEach(() => { vi.useRealTimers(); });
function fixture() {
  vi.useFakeTimers();
  const starts: number[] = [];
  let active = 0, peak = 0;
  const measure = async () => { starts.push(Date.now()); peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 300)); active--; };
  const read = vi.fn(async (_target: WorkshopTarget, _signal: AbortSignal) => { await measure(); return { status: 3 } as InstanceDetail; });
  const send = vi.fn(async (_target: WorkshopTarget, _signal: AbortSignal) => { await measure(); });
  const scope = effectScope();
  const batch = scope.run(() => useWorkshopDownload({ read, send }))!;
  return { read, send, batch, scope, starts, peak: () => peak };
}
describe("fixed Workshop download batching", () => {
  it("keeps composite identity, snapshot, per-instance sends, pacing and concurrency", async () => {
    const f = fixture(), targets = [target(), target(), target(a, c), target(c, b)];
    const run = f.batch.run(targets, async () => true);
    targets[0].instanceUuid = c;
    await vi.runAllTimersAsync(); await run;
    expect(f.send.mock.calls.map(([row]) => `${row.daemonId}:${row.instanceUuid}`)).toEqual([`${a}:${b}`, `${a}:${c}`, `${c}:${b}`]);
    expect(f.batch.rows.value.every((row) => row.state === "accepted")).toBe(true);
    expect(f.peak()).toBeLessThanOrEqual(2);
    expect(f.starts.slice(1).every((start, i) => start - f.starts[i] >= 200)).toBe(true);
    f.scope.stop();
  });
  it("does not dispatch empty, oversized, canceled or duplicate activations", async () => {
    const f = fixture(), confirm = vi.fn(async () => false);
    expect(await f.batch.run([], confirm)).toBe(false);
    expect(await f.batch.run(Array.from({ length: 201 }, (_, i) => target(a, i.toString(16).padStart(32, '0'))), confirm)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(await f.batch.run([target()], confirm)).toBe(false);
    let resolve!: (value: boolean) => void;
    const first = f.batch.run([target()], () => new Promise((r) => { resolve = r; }));
    expect(await f.batch.run([target()], async () => true)).toBe(false);
    resolve(true); await vi.runAllTimersAsync(); await first;
    expect(f.send).toHaveBeenCalledTimes(1); f.scope.stop();
  });
  it("skips offline, global, malformed and stopped targets without commands", async () => {
    const f = fixture(); f.read.mockResolvedValue({ status: 0 } as InstanceDetail);
    const run = f.batch.run([{ ...target(), offline: true }, target(a, 'global0001'), target('', c), target(c, a)], async () => true);
    await vi.runAllTimersAsync(); await run;
    expect(f.send).not.toHaveBeenCalled(); expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.batch.rows.value.every((row) => row.state === "skipped")).toBe(true); f.scope.stop();
  });
  it("continues independent failures and marks response loss uncertain without retries", async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { response: { status: 403 } }))
      .mockRejectedValueOnce(new Error('timeout'));
    const run = f.batch.run([target(), target(a, c), target(c, a)], async () => true);
    await vi.runAllTimersAsync(); await run;
    expect(f.batch.rows.value.map((row) => row.state)).toEqual(['failed', 'uncertain', 'accepted']);
    expect(f.send).toHaveBeenCalledTimes(3); f.scope.stop();
  });
  it("disposes queued timers and aborts in-flight requests on unmount", async () => {
    const f = fixture();
    const run = f.batch.run([target(), target(a, c)], async () => true);
    await vi.advanceTimersByTimeAsync(1); f.scope.stop();
    await vi.runAllTimersAsync(); await run;
    expect(f.send).not.toHaveBeenCalled();
    expect(f.read.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
