import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { createOperations, deleteOperations, useBulkSchedules } from "../useBulkSchedules";
import { instanceKey, scheduleKey, type ScheduleInstance } from "../useScheduleInventory";
import type { SchedulePayload } from "@/tools/schedule";
const api = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
vi.mock("@/services/apis", () => ({}));
vi.mock("@/services/apis/instance", () => ({
  scheduleCreate: () => ({ execute: api.create }),
  scheduleDelete: () => ({ execute: api.remove })
}));
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
const target = (id: string, names: string[] = []): ScheduleInstance => ({
  key: instanceKey("node", id),
  daemonId: "node",
  nodeName: "Node",
  instanceUuid: id,
  instanceName: id,
  nodeAvailable: true,
  planError: false,
  instanceStatus: 0,
  tasks: names.map((name) => ({
    name,
    instanceUuid: id,
    type: 1,
    time: "3600",
    count: -1,
    actions: [{ type: "restart", payload: "" }]
  }))
});
const draft = (name: string): SchedulePayload => ({
  name,
  type: 1,
  time: "3600",
  count: -1,
  actions: [{ type: "restart", payload: "" }]
});
const setup = () => {
  const scope = effectScope();
  return { scope, bulk: scope.run(useBulkSchedules)! };
};
beforeEach(() => {
  api.create.mockReset().mockResolvedValue(ref(true));
  api.remove.mockReset().mockResolvedValue(ref(true));
});

describe("bulk schedules", () => {
  it("appends in order, preserves conflicts and observes each instance's capacity", async () => {
    const { scope, bulk } = setup();
    const full = target(
      "almost-full",
      Array.from({ length: 7 }, (_, i) => "existing" + i)
    );
    const operations = createOperations(
      [target("conflict", ["first"]), full],
      [draft("first"), draft("second")]
    );
    await bulk.run(operations);
    expect(bulk.results.value.map((op) => op.status)).toEqual([
      "conflict",
      "success",
      "success",
      "failed"
    ]);
    expect(api.create.mock.calls.map(([config]) => [config.params.uuid, config.data.name])).toEqual(
      [
        ["conflict", "second"],
        ["almost-full", "first"]
      ]
    );
    expect(api.remove).not.toHaveBeenCalled();
    expect(full.tasks).toHaveLength(7);
    scope.stop();
  });
  it("limits total mutation concurrency to five and rejects duplicate submission", async () => {
    const { scope, bulk } = setup();
    let active = 0,
      max = 0;
    api.create.mockImplementation(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return ref(true);
    });
    const ops = createOperations(
      Array.from({ length: 12 }, (_, i) => target(String(i))),
      [draft("one"), draft("two")]
    );
    const first = bulk.run(ops);
    await bulk.run(ops);
    await first;
    expect(max).toBe(5);
    expect(api.create).toHaveBeenCalledTimes(24);
    expect(bulk.completed.value).toBe(24);
    scope.stop();
  });
  it("does not confirm failed or non-affirmative responses and retries only refreshed unresolved items", async () => {
    const { scope, bulk } = setup();
    api.create.mockImplementation(async ({ params }) => {
      if (params.uuid === "lost") throw new Error("timeout");
      return ref(true);
    });
    await bulk.run(createOperations([target("ok"), target("lost")], [draft("plan")]));
    expect(bulk.results.value.map((op) => op.status)).toEqual(["success", "uncertain"]);
    const retry = bulk.prepareRetry([target("ok", ["plan"]), target("lost", ["plan"])]);
    expect(retry).toHaveLength(1);
    await bulk.run(retry, true);
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(bulk.results.value.map((op) => op.status)).toEqual(["success", "conflict"]);
    api.create.mockResolvedValue(ref(false));
    await bulk.run(createOperations([target("non-affirmative")], [draft("plan")]));
    expect(bulk.results.value[0].status).toBe("uncertain");
    scope.stop();
  });
  it("deletes exact identities across nodes and reports already absent schedules without replay", async () => {
    const { scope, bulk } = setup();
    const a = target("same", ["remove", "keep"]);
    const b = { ...a, daemonId: "other" };
    await bulk.run(
      deleteOperations(
        [a, b].map((row) => ({
          ...row,
          task: row.tasks[0],
          key: scheduleKey(row.daemonId, row.instanceUuid, "remove")
        }))
      )
    );
    expect(api.remove.mock.calls.map(([config]) => config.params)).toEqual([
      { daemonId: "node", uuid: "same", task_name: "remove" },
      { daemonId: "other", uuid: "same", task_name: "remove" }
    ]);
    expect(a.tasks.map((task) => task.name)).toEqual(["remove", "keep"]);
    api.remove.mockRejectedValue(new Error("connection lost"));
    await bulk.run(
      deleteOperations([{ ...a, task: a.tasks[0], key: scheduleKey("node", "same", "remove") }])
    );
    const retry = bulk.prepareRetry([target("same", ["keep"])]);
    await bulk.run(retry, true);
    expect(api.remove).toHaveBeenCalledTimes(3);
    expect(bulk.results.value[0].detail).toBe("TXT_CODE_scheduleManager.absent");
    scope.stop();
  });
  it("freezes draft payloads and stops dispatching queued work on scope disposal", async () => {
    const { scope, bulk } = setup();
    let finish!: () => void;
    api.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(ref(true));
        })
    );
    const payload = draft("plan");
    const ops = createOperations([target("instance")], [payload, draft("later")]);
    payload.actions[0].type = "kill";
    const pending = bulk.run(ops);
    scope.stop();
    finish();
    await pending;
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create.mock.calls[0][0].data.actions[0].type).toBe("restart");
  });
  it("skips offline and incomplete inventory targets while continuing with stopped instances", async () => {
    const { scope, bulk } = setup();
    await bulk.run(
      createOperations(
        [
          { ...target("offline"), nodeAvailable: false },
          { ...target("unreadable"), planError: true },
          target("stopped")
        ],
        [draft("plan")]
      )
    );
    expect(bulk.results.value.map((op) => op.status)).toEqual(["skipped", "skipped", "success"]);
    expect(api.create).toHaveBeenCalledTimes(1);
    scope.stop();
  });
});
