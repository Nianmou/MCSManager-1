// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref, type PropType } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScheduleManager from "../ScheduleManager.vue";
import { instanceKey, scheduleKey } from "@/hooks/useScheduleInventory";

const data = vi.hoisted(() => ({
  pages: {} as Record<number, any>,
  plans: {} as any,
  admin: true,
  create: vi.fn(),
  remove: vi.fn()
}));
vi.mock("@/services/apis", () => ({
  remoteNodeList: () => ({
    state: ref([
      { uuid: "a", remarks: "A" },
      { uuid: "b", remarks: "B" }
    ]),
    execute: vi.fn()
  }),
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
vi.mock("@/services/apis/instance", () => ({
  scheduleCreate: () => ({ execute: data.create }),
  scheduleDelete: () => ({ execute: data.remove })
}));
vi.mock("@/stores/useAppStateStore", () => ({
  useAppStateStore: () => ({ isAdmin: ref(data.admin) })
}));
vi.mock("@/hooks/useInstance", () => ({ TYPE_UNIVERSAL: "universal" }));
vi.mock("@/lang/i18n", () => ({
  t: (key: string, params?: object) => key + (params ? JSON.stringify(params) : "")
}));
vi.mock("@/tools/validator", () => ({ reportErrorMsg: vi.fn() }));
vi.mock("../NewSchedule.vue", () => ({ default: { render: () => null } }));
const Composer = defineComponent({
  name: "BulkScheduleComposer",
  emits: ["prepare"],
  setup: (_, { expose }) => {
    expose({ openDialog: vi.fn(), close: vi.fn() });
    return () => h("div");
  }
});
const Table = defineComponent({
  name: "ATable",
  props: {
    dataSource: { type: Array as PropType<any[]>, required: true },
    rowSelection: { type: Object as PropType<any> }
  },
  setup: () => () => h("div")
});
const Modal = defineComponent({
  name: "AModal",
  props: ["open"],
  emits: ["ok", "update:open"],
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.())
});
const Input = defineComponent({
  name: "AInput",
  props: ["value"],
  emits: ["update:value"],
  setup: () => () => h("div")
});
const Tabs = defineComponent({
  name: "ATabs",
  props: ["activeKey"],
  emits: ["update:activeKey"],
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.())
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.())
});
const Button = defineComponent({
  props: ["disabled"],
  setup:
    (props, { slots }) =>
    () =>
      h("button", { disabled: props.disabled }, slots.default?.())
});
const openManager = async () => {
  const wrapper = mount(ScheduleManager, {
    global: {
      stubs: {
        AModal: Modal,
        ASpace: Slot,
        ATable: Table,
        AButton: Button,
        AAlert: true,
        ATag: true,
        AInput: Input,
        ASelect: Slot,
        ATabs: Tabs,
        ATabPane: true,
        ADivider: true,
        AProgress: true,
        BulkScheduleComposer: Composer
      }
    }
  });
  await (wrapper.vm as any).openDialog();
  await flushPromises();
  return wrapper;
};
const instance = (instanceUuid: string) => ({
  instanceUuid,
  status: 0,
  config: { nickname: instanceUuid }
});
const plan = (instanceUuid: string, name: string) => ({
  instanceUuid,
  name,
  type: 1,
  time: "3600",
  count: -1,
  actions: [{ type: "restart", payload: "" }]
});
const payload = {
  name: "new-plan",
  type: 1,
  time: "3600",
  count: -1,
  actions: [{ type: "restart", payload: "" }]
};
beforeEach(() => {
  data.admin = true;
  data.pages = {};
  data.plans = {};
  data.create.mockReset().mockResolvedValue(ref(true));
  data.remove.mockReset().mockResolvedValue(ref(true));
});

describe("schedule manager", () => {
  it("shows real plans and isolates identical instance IDs on different nodes", async () => {
    data.pages[1] = {
      a: { instances: [instance("same")], maxPage: 1 },
      b: { instances: [instance("same")], maxPage: 1 }
    };
    data.plans = {
      a: { available: true, tasks: [plan("same", "restart-a")] },
      b: { available: true, tasks: [plan("same", "backup-b")] }
    };
    const wrapper = await openManager();
    const table = wrapper.findAllComponents(Table)[0];
    expect(
      table.props("dataSource").map((row: any) => row.tasks.map((task: any) => task.name))
    ).toEqual([["restart-a"], ["backup-b"]]);
    expect(table.props("rowSelection").selectedRowKeys).toEqual([]);
    wrapper.unmount();
  });
  it("loads later instance pages without duplicating nodes that already ended", async () => {
    data.pages[1] = {
      a: { instances: [instance("first")], maxPage: 2 },
      b: { instances: [instance("only")], maxPage: 1 }
    };
    data.pages[2] = {
      a: { instances: [instance("last")], maxPage: 2 },
      b: { instances: [instance("only")], maxPage: 1 }
    };
    data.plans = { a: { available: true, tasks: [plan("last", "restart")] } };
    const wrapper = await openManager();
    const rows = wrapper.findAllComponents(Table)[0].props("dataSource");
    expect(rows.map((row: any) => row.key)).toEqual([
      instanceKey("a", "first"),
      instanceKey("a", "last"),
      instanceKey("b", "only")
    ]);
    expect(rows[1].tasks[0].name).toBe("restart");
    wrapper.unmount();
  });
  it("reports a read failure without marking a connected node offline or selecting it", async () => {
    data.pages[1] = { a: { instances: [instance("game")], maxPage: 1 } };
    data.plans = { a: { available: true, tasks: [], error: true } };
    const wrapper = await openManager();
    const table = wrapper.findAllComponents(Table)[0];
    expect(table.props("dataSource")[0]).toMatchObject({ nodeAvailable: true, planError: true });
    expect(table.props("rowSelection").selectedRowKeys).toEqual([]);
    wrapper.unmount();
  });
  it("uses all nodes and pages despite filters, freezes preview and does not enroll later instances", async () => {
    data.pages[1] = {
      a: { instances: [instance("first")], maxPage: 2 },
      b: { instances: [instance("other")], maxPage: 1 }
    };
    data.pages[2] = { a: { instances: [instance("last")], maxPage: 2 } };
    data.plans = { a: { available: true, tasks: [] }, b: { available: true, tasks: [] } };
    const wrapper = await openManager();
    wrapper.findComponent(Input).vm.$emit("update:value", "first");
    await flushPromises();
    expect(wrapper.findAllComponents(Table)[0].props("dataSource")).toHaveLength(1);
    wrapper.findComponent(Composer).vm.$emit("prepare", "all", [payload]);
    await flushPromises();
    const preview = wrapper.findAllComponents(Table)[1].props("dataSource");
    expect(preview).toHaveLength(3);
    data.pages[1].a.instances.push(instance("created-later"));
    wrapper.findAllComponents(Modal)[1].vm.$emit("ok");
    await flushPromises();
    expect(data.create.mock.calls.map(([config]) => config.params.uuid).sort()).toEqual([
      "first",
      "last",
      "other"
    ]);
    expect(data.remove).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it("only adds to explicitly selected instances", async () => {
    data.pages[1] = { a: { instances: [instance("first"), instance("second")], maxPage: 1 } };
    data.plans = { a: { available: true, tasks: [] } };
    const wrapper = await openManager();
    wrapper
      .findAllComponents(Table)[0]
      .props("rowSelection")
      .onChange([instanceKey("a", "second")]);
    wrapper.findComponent(Composer).vm.$emit("prepare", "selected", [payload]);
    await flushPromises();
    wrapper.findAllComponents(Modal)[1].vm.$emit("ok");
    await flushPromises();
    expect(data.create).toHaveBeenCalledTimes(1);
    expect(data.create.mock.calls[0][0].params.uuid).toBe("second");
    wrapper.unmount();
  });
  it("confirms hidden schedule selections and cancellation sends no deletion", async () => {
    data.pages[1] = { a: { instances: [instance("first"), instance("second")], maxPage: 1 } };
    data.plans = {
      a: {
        available: true,
        tasks: [plan("first", "remove"), plan("first", "keep"), plan("second", "remove")]
      }
    };
    const wrapper = await openManager();
    wrapper.findComponent(Tabs).vm.$emit("update:activeKey", "schedules");
    await flushPromises();
    wrapper
      .findAllComponents(Table)[0]
      .props("rowSelection")
      .onChange([scheduleKey("a", "first", "remove"), scheduleKey("a", "second", "remove")]);
    wrapper.findComponent(Input).vm.$emit("update:value", "first");
    await flushPromises();
    await wrapper.find('[data-testid="batch-delete"]').trigger("click");
    await flushPromises();
    expect(
      wrapper
        .findAllComponents(Table)[1]
        .props("dataSource")
        .map((op: any) => op.name)
    ).toEqual(["remove", "remove"]);
    wrapper.findAllComponents(Modal)[1].vm.$emit("update:open", false);
    await flushPromises();
    expect(data.remove).not.toHaveBeenCalled();
    await wrapper.find('[data-testid="batch-delete"]').trigger("click");
    await flushPromises();
    wrapper.findAllComponents(Modal)[1].vm.$emit("ok");
    await flushPromises();
    expect(data.remove.mock.calls.map(([config]) => config.params.task_name)).toEqual([
      "remove",
      "remove"
    ]);
    expect(data.create).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it("keeps the global workspace inaccessible to regular users", async () => {
    data.admin = false;
    const wrapper = await openManager();
    expect(wrapper.findAllComponents(Table)).toHaveLength(0);
    expect(wrapper.findAllComponents(Composer)).toHaveLength(0);
    wrapper.unmount();
  });
});
