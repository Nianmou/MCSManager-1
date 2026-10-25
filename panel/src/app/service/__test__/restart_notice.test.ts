import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeError, NoticeJob, RestartNoticeService, validateNoticeInput, type NoticeSession } from "../restart_notice";

const target = { daemonId: "node-1", instanceUuid: "instance-1" };
const input = { targets: [target], seconds: 10, message: "Server restart; 请稍候" };
let service: RestartNoticeService;
let data: Map<string, NoticeJob>;
let events: (event: string) => void;
let session: NoticeSession;
let started: number;
let accepted: number;
let now: number;
let logs: unknown[];
let store: ReturnType<typeof vi.fn>;
const state = () => service.list()[0].targets[0];
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(async () => {
  vi.useFakeTimers();
  now = 0; started = 1; accepted = 0; logs = []; data = new Map();
  session = {
    detail: vi.fn(async () => ({ status: 3, started, config: { nickname: "Game" } })),
    exchange: vi.fn(async (taskId, action) => {
      if (action === "begin") accepted = now;
      return { v: 1, taskId, requestId: "request", action,
        state: action === "cancel" ? "canceled" : now - accepted >= 10000 ? "ready" : "countdown",
        remainingMs: Math.max(0, 10000 - (now - accepted)) };
    }),
    restart: vi.fn(async () => { events("stopped"); started++; events("opened"); }),
    dispose: vi.fn(async () => {})
  };
  store = vi.fn(async (_c: string, id: string, job: NoticeJob) => { data.set(id, structuredClone(job)); });
  const storage = {
    list: async () => [...data.keys()],
    load: async (_c: string, _t: any, id: string) => JSON.parse(JSON.stringify(data.get(id))),
    store,
    delete: async (_c: string, id: string) => { data.delete(id); }
  };
  service = new RestartNoticeService(() => storage, { open: async (_target, callback) => { events = callback; return session; } }, (error) => logs.push(error), () => now);
  await service.initialize();
});
afterEach(async () => { await service.dispose(); await flush(); vi.useRealTimers(); });
async function advance(ms: number) { now += ms; await vi.advanceTimersByTimeAsync(ms); }

describe("restart notification jobs", () => {
  it("cancellation wins against a late begin ACK", async () => {
    let accept!: (value: any) => void;
    const exchange = session.exchange;
    vi.mocked(session.exchange).mockImplementation((taskId, action, ...rest) => action === "begin"
      ? new Promise((resolve) => { accept = resolve; }) : exchange(taskId, action, ...rest));
    const job = await service.create(input); await flush(); await service.cancel(job.id);
    accept({ state: "countdown", remainingMs: 10000 }); await flush(); await advance(15000);
    expect(state().state).toBe("canceled"); expect(session.restart).not.toHaveBeenCalled();
  });

  it("cancellation wins while the final plugin check is in flight", async () => {
    const job = await service.create(input); await flush();
    let accept!: (value: any) => void;
    const exchange = session.exchange;
    vi.mocked(session.exchange).mockImplementation((taskId, action, ...rest) => action === "status"
      ? new Promise((resolve) => { accept = resolve; }) : exchange(taskId, action, ...rest));
    await advance(10000); await service.cancel(job.id);
    accept({ state: "ready", remainingMs: 0 }); await flush();
    expect(state().state).toBe("canceled"); expect(session.restart).not.toHaveBeenCalled();
  });

  it("fails closed when dispatch intent cannot be persisted", async () => {
    const original = store.getMockImplementation()!;
    store.mockImplementation(async (...args: any[]) => {
      if (args[2].targets.some((target: any) => target.state === "restarting")) throw new Error("storage unavailable");
      return original(...args);
    });
    await service.create(input); await flush(); await advance(10000);
    expect(state().state).toBe("failed"); expect(session.restart).not.toHaveBeenCalled();
  });

  it("bounds persisted completed history by age and count", async () => {
    await service.dispose();
    for (let i = 0; i < 202; i++) data.set(String(i), Object.assign(new NoticeJob(), {
      id: String(i), createdAt: Date.now() - i, finishedAt: Date.now() - i,
      targets: [{ ...target, name: "done", state: "completed", taskId: String(i) }]
    }));
    data.set("expired", Object.assign(new NoticeJob(), { id: "expired", finishedAt: Date.now() - 86400001 }));
    await service.initialize();
    expect(service.list()).toHaveLength(200); expect(data.size).toBe(200); expect(data.has("expired")).toBe(false);
  });
  it("validates bounds and controls while encoding punctuation as message data", () => {
    expect(validateNoticeInput(input).message).toContain(";");
    for (const patch of [{ seconds: 9 }, { seconds: 3601 }, { seconds: 10.5 }, { message: "x\nquit" },
      { targets: [] }, { targets: [{ ...target, instanceUuid: "../../x" }] }, { message: "x".repeat(201) }])
      expect(() => validateNoticeInput({ ...input, ...patch })).toThrow("invalidInput");
    expect(validateNoticeInput({ ...input, targets: [target, target] }).targets).toHaveLength(1);
  });

  it("waits the full accepted countdown and verifies a stopped/opened/running restart once", async () => {
    const job = await service.create(input); await flush();
    expect(state().state).toBe("countdown");
    expect(data.get(job.id)?.targets[0].state).toBe("countdown");
    await advance(9000); expect(session.restart).not.toHaveBeenCalled();
    await advance(1000); expect(session.restart).toHaveBeenCalledTimes(1);
    expect(state().state).toBe("completed");
    expect(service.get(job.id).finishedAt).toBeGreaterThan(0);
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("skips an unacknowledged/unsupported plugin instead of restarting", async () => {
    vi.mocked(session.exchange).mockRejectedValue(new NoticeError("notSupported"));
    await service.create(input); await flush(); await advance(20000);
    expect(state()).toMatchObject({ state: "skipped", reason: "notSupported" });
    expect(session.restart).not.toHaveBeenCalled();
  });

  it("reserves each instance and rejects duplicate active jobs", async () => {
    await service.create(input); await flush();
    await expect(service.create(input)).rejects.toThrow("busy");
    expect(service.list()).toHaveLength(1);
  });

  it("cancels pending work, clears plugin notice and permits a fresh countdown", async () => {
    const job = await service.create(input); await flush();
    await service.cancel(job.id); await flush(); await advance(11000);
    expect(state().state).toBe("canceled");
    expect(session.restart).not.toHaveBeenCalled();
    expect(session.exchange).toHaveBeenCalledWith(job.targets[0].taskId, "cancel");
    const retried = await service.create(input); await flush();
    expect(retried.targets[0].taskId).not.toBe(job.targets[0].taskId);
    expect(state().state).toBe("countdown");
  });

  it.each(["stopped", "opened", "disconnect", "failure"])("interrupts on %s during countdown", async (event) => {
    await service.create(input); await flush(); events(event); await flush(); await advance(11000);
    expect(state().state).toBe("interrupted");
    expect(session.restart).not.toHaveBeenCalled();
  });

  it("detects changed start counts even if lifecycle events were missed", async () => {
    await service.create(input); await flush(); started++;
    await advance(5000);
    expect(state()).toMatchObject({ state: "failed", reason: "instanceChanged" });
    expect(session.restart).not.toHaveBeenCalled();
  });

  it("checks plugin continuity again before dispatch", async () => {
    await service.create(input); await flush();
    vi.mocked(session.exchange).mockImplementation(async (taskId, action) => ({ v: 1, taskId, requestId: "x", action, state: "none", remainingMs: 0 }));
    await advance(10000);
    expect(state()).toMatchObject({ state: "failed", reason: "pluginLost" });
    expect(session.restart).not.toHaveBeenCalled();
  });

  it("does not report successful restart on a command ACK without lifecycle events", async () => {
    vi.mocked(session.restart).mockResolvedValue();
    await service.create(input); await flush(); await advance(10000); await advance(120000);
    expect(state()).toMatchObject({ state: "failed", reason: "restartTimeout" });
    expect(session.restart).toHaveBeenCalledOnce();
  });

  it("keeps another target running when the first target is unsupported", async () => {
    vi.mocked(session.exchange).mockRejectedValue(new NoticeError("notSupported"));
    const first = await service.create(input); await flush();
    expect(service.get(first.id).targets[0].state).toBe("skipped");
    // A new target is independent even when one job fails.
    vi.mocked(session.exchange).mockResolvedValue({ v: 1, taskId: "x", requestId: "x", action: "begin", state: "countdown", remainingMs: 10000 });
    const second = await service.create({ ...input, targets: [{ ...target, instanceUuid: "other" }] }); await flush();
    expect(service.get(second.id).targets[0].state).toBe("countdown");
  });

  it("recovers pending records as interrupted and never replays restart", async () => {
    const job = Object.assign(new NoticeJob(), { id: "saved", createdAt: Date.now(), targets: [{ ...target, taskId: "saved-task", state: "countdown", name: "Game" }] });
    data.set(job.id, job);
    await service.dispose();
    await service.initialize(); await flush(); await advance(20000);
    expect(service.get(job.id).targets[0]).toMatchObject({ state: "interrupted", reason: "panelRestarted" });
    expect(session.restart).not.toHaveBeenCalled();
    expect(session.exchange).toHaveBeenCalledWith("saved-task", "cancel");
  });
});
