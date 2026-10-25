import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { instanceKey, scheduleKey, useScheduleInventory } from "../useScheduleInventory";
const data = vi.hoisted(() => ({
  pages: {} as Record<number, any>,
  nodes: [] as any[],
  plans: {} as any
}));
vi.mock("@/services/apis", () => ({
  remoteNodeList: () => ({ state: ref(data.nodes), execute: vi.fn() }),
  remoteInstancesGlobal: () => {
    const state = ref({});
    return {
      state,
      execute: vi.fn(async ({ params }) => {
        state.value = data.pages[params.page];
      })
    };
  },
  scheduleGlobal: () => ({ state: ref(data.plans), execute: vi.fn() })
}));
const inst = (instanceUuid: string) => ({
  instanceUuid,
  status: 0,
  config: { nickname: instanceUuid }
});

describe("schedule inventory", () => {
  it("loads each node's pages without duplicates and keeps explicit selections", async () => {
    data.nodes = [
      { uuid: "a", remarks: "A" },
      { uuid: "b", remarks: "B" }
    ];
    data.pages = {
      1: {
        a: { instances: [inst("same")], maxPage: 2 },
        b: { instances: [inst("same")], maxPage: 1 }
      },
      2: {
        a: { instances: [inst("later")], maxPage: 2 },
        b: { instances: [inst("same")], maxPage: 1 }
      }
    };
    data.plans = {
      a: { available: true, tasks: [{ instanceUuid: "later", name: "plan" }] },
      b: { available: true, tasks: [] }
    };
    const inventory = useScheduleInventory();
    const first = inventory.load();
    expect(inventory.load()).toBe(first);
    await first;
    expect(inventory.rows.value.map((r) => r.key)).toEqual([
      instanceKey("a", "same"),
      instanceKey("a", "later"),
      instanceKey("b", "same")
    ]);
    expect(inventory.selectedInstances.value).toEqual([]);
    inventory.selectedInstances.value = [instanceKey("b", "same"), "removed"];
    inventory.selectedSchedules.value = [scheduleKey("a", "later", "plan")];
    await inventory.load();
    expect(inventory.selectedInstances.value).toEqual([instanceKey("b", "same")]);
    expect(inventory.selectedSchedules.value).toEqual([scheduleKey("a", "later", "plan")]);
    expect(inventory.removedSelections.value).toBe(1);
  });
  it("distinguishes unreadable plans from offline nodes and reports unknown coverage", async () => {
    data.nodes = [
      { uuid: "a", remarks: "A" },
      { uuid: "offline", remarks: "Offline" }
    ];
    data.pages = { 1: { a: { instances: [inst("game")], maxPage: 1 } } };
    data.plans = {
      a: { available: true, tasks: [], error: true },
      offline: { available: false, tasks: [] }
    };
    const inventory = useScheduleInventory();
    await inventory.load();
    expect(inventory.rows.value[0]).toMatchObject({ nodeAvailable: true, planError: true });
    expect(inventory.excludedNodes.value).toEqual(["A", "Offline"]);
    expect(inventory.selectedInstances.value).toEqual([]);
  });
  it("fails closed when a later page fails instead of claiming a complete inventory", async () => {
    data.nodes = [{ uuid: "a" }];
    data.pages = {
      1: { a: { instances: [inst("first")], maxPage: 2 } },
      2: { a: { instances: [], error: "offline" } }
    };
    data.plans = { a: { available: true, tasks: [] } };
    const inventory = useScheduleInventory();
    await inventory.load();
    expect(inventory.rows.value[0].planError).toBe(true);
    expect(inventory.excludedNodes.value).toEqual(["a"]);
  });
});
