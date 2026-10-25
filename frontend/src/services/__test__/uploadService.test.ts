// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import uploadService from "../uploadService";
const api = vi.hoisted(() => ({ init: vi.fn(), piece: vi.fn(), id: 0 }));
vi.mock("@/services/apis/fileManager", () => ({
  uploadFile: () => {
    const state = ref<any>();
    return {
      state,
      execute: async (options: any) => {
        const result = await api.init(options);
        state.value = result || { id: `writer-${++api.id}`, received: [] };
      }
    };
  },
  uploadFilePiece: () => ({ execute: (...args: any[]) => api.piece(...args) })
}));
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/tools/validator", () => ({ reportErrorMsg: vi.fn() }));
vi.mock("ant-design-vue", () => ({ message: { error: vi.fn(), success: vi.fn() } }));
const append = (size = 20, onEnd?: () => void) =>
  uploadService.append(
    new File([new Uint8Array(size)], "package.zip"),
    "http://node",
    "password",
    { overwrite: false, unzip: false },
    (file) => {
      if (onEnd) file.addCallback("end", onEnd);
    }
  );
const tick = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
beforeEach(async () => {
  api.init.mockReset().mockResolvedValue(undefined);
  api.piece.mockReset().mockResolvedValue(undefined);
  await uploadService.stop();
  api.id = 0;
});
describe("upload terminal results", () => {
  it("waits for every chunk response, retains existing end callbacks", async () => {
    let finish!: () => void;
    api.piece.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const end = vi.fn();
    const task = append(20, end);
    await tick();
    expect(task.result).toBeUndefined();
    expect(end).not.toHaveBeenCalled();
    finish();
    await expect(task.completion).resolves.toEqual({ status: "success" });
    expect(end).toHaveBeenCalledTimes(1);
  });
  it("settles initialization failure and allows the next queued file to complete", async () => {
    api.init.mockRejectedValueOnce(new Error("init failed"));
    const failed = append();
    const next = append();
    await expect(failed.completion).resolves.toMatchObject({ status: "failed" });
    await expect(next.completion).resolves.toEqual({ status: "success" });
  });
  it("reports exhausted retries as failure, not end-callback success", async () => {
    api.piece.mockRejectedValue(new Error("network"));
    const task = append();
    await expect(task.completion).resolves.toMatchObject({ status: "failed" });
    expect(api.piece).toHaveBeenCalledTimes(3);
  });
  it("cancels a current file and advances the queue without a stale pointer", async () => {
    api.piece.mockImplementationOnce(() => new Promise(() => {}));
    const end = vi.fn();
    const task = append(20, end);
    await tick();
    const next = append();
    await task.stop();
    await expect(task.completion).resolves.toEqual({ status: "canceled" });
    await expect(next.completion).resolves.toEqual({ status: "success" });
    expect(end).toHaveBeenCalledTimes(1);
  });
  it("handles cancellation before initialization completes", async () => {
    let initialized!: () => void;
    api.init.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          initialized = resolve;
        })
    );
    const task = append();
    await task.stop();
    initialized();
    await tick();
    expect(task.result?.status).toBe("canceled");
    expect(api.piece).not.toHaveBeenCalled();
    expect(uploadService.files.size).toBe(0);
  });
});
