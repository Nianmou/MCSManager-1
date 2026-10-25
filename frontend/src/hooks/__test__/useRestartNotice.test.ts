import { effectScope, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestartNotice, validNoticeDraft } from "../useRestartNotice";
import type { RestartNoticeJob } from "@/services/apis/restartNotice";

const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), create: vi.fn(), cancel: vi.fn() }));
vi.mock("@/services/apis/restartNotice", () => ({
  restartNoticeList: () => ({ execute: api.list }),
  restartNoticeDetail: () => ({ execute: api.detail }),
  restartNoticeCreate: () => ({ execute: api.create }),
  restartNoticeCancel: () => ({ execute: api.cancel })
}));
const target = { daemonId: "node", instanceUuid: "instance", name: "Test" };
const saved: RestartNoticeJob = { id: "job", createdAt: 1, finishedAt: 0, seconds: 60, message: "Notice",
  targets: [{ ...target, taskId: "task", state: "countdown", deadline: 60000 }] };
let scope: ReturnType<typeof effectScope>;
let hook: ReturnType<typeof useRestartNotice>;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  api.list.mockResolvedValue(ref([structuredClone(saved)]));
  api.detail.mockResolvedValue(ref(structuredClone(saved)));
  api.create.mockResolvedValue(ref(structuredClone(saved)));
  api.cancel.mockResolvedValue(ref({ ...saved, finishedAt: 2, targets: [{ ...saved.targets[0], state: "canceled" }] }));
  scope = effectScope(); scope.run(() => { hook = useRestartNotice(); });
});
afterEach(() => { scope.stop(); vi.useRealTimers(); });
describe("restart notice workflow", () => {
  it("requires selected targets and valid integer countdown/message", async () => {
    expect(validNoticeDraft([], 60, "x")).toBe(false);
    expect(validNoticeDraft([target], 9, "x")).toBe(false);
    expect(validNoticeDraft([target], 60.1, "x")).toBe(false);
    expect(validNoticeDraft([target], 60, "x\nquit")).toBe(false);
    expect(validNoticeDraft([target], 3600, "维护;test")).toBe(true);
    expect(await hook.submit([], 60, "x")).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });
  it("recovers history and continues polling while visible", async () => {
    await hook.open(); expect(hook.job.value?.id).toBe("job");
    await vi.advanceTimersByTimeAsync(1000); expect(api.detail).toHaveBeenCalledOnce();
    hook.close(); await vi.advanceTimersByTimeAsync(5000);
    expect(api.detail).toHaveBeenCalledOnce(); expect(api.cancel).not.toHaveBeenCalled();
    await hook.open(); expect(hook.job.value?.id).toBe("job");
  });
  it("submits only frozen selected identifiers and the edited full countdown", async () => {
    await hook.open(); expect(await hook.submit([target], 90, " 提醒 ")).toBe(true);
    expect(api.create).toHaveBeenCalledWith({ data: { targets: [{ daemonId: "node", instanceUuid: "instance" }], seconds: 90, message: "提醒" } });
  });
  it("ignores an older poll response after cancellation", async () => {
    await hook.open();
    let resolve!: (value: any) => void;
    api.detail.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(1000);
    await hook.cancel(["task"]);
    resolve(ref(saved)); await Promise.resolve(); await Promise.resolve();
    expect(hook.job.value?.targets[0].state).toBe("canceled");
    expect(api.cancel).toHaveBeenCalledWith({ data: { taskIds: ["task"] } });
  });
  it("shows request failures and does not invent successful work", async () => {
    api.create.mockRejectedValue(new Error("offline"));
    expect(await hook.submit([target], 60, "Notice")).toBe(false);
    expect(hook.error.value).toBe("offline"); expect(hook.saving.value).toBe(false);
  });
  it("limits retry targets to skipped, interrupted and failed instances", async () => {
    api.list.mockResolvedValue(ref([{ ...saved, targets: ["completed", "countdown", "skipped", "interrupted", "failed", "canceled"].map((state, i) => ({ ...saved.targets[0], taskId: String(i), state })) }]));
    await hook.open(); expect(hook.failed.value.map((target) => target.state)).toEqual(["skipped", "interrupted", "failed"]);
  });
});
