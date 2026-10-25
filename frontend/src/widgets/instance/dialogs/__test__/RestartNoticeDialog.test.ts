// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestartNoticeDialog from "../RestartNoticeDialog.vue";

const api = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), cancel: vi.fn(), detail: vi.fn() }));
vi.mock("@/services/apis/restartNotice", () => ({
  restartNoticeCreate: () => ({ execute: api.create }), restartNoticeList: () => ({ execute: api.list }),
  restartNoticeCancel: () => ({ execute: api.cancel }), restartNoticeDetail: () => ({ execute: api.detail })
}));
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
const job = { id: "job", createdAt: 1, finishedAt: 2, seconds: 90, message: "Maintenance",
  targets: [{ daemonId: "node", instanceUuid: "instance", name: "Game", taskId: "task", state: "skipped", reason: "notSupported" }] };
const Box = defineComponent({ setup: (_, { slots }) => () => h("div", slots.default?.()) });
const Button = defineComponent({ setup: (_, { slots }) => () => h("button", slots.default?.()) });
const Input = defineComponent({ props: ["value"], emits: ["update:value"], setup: (props, { emit }) => () =>
  h("input", { value: props.value, onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value) }) });
const NumberInput = defineComponent({ props: ["value"], emits: ["update:value"], setup: (props, { emit }) => () =>
  h("input", { type: "number", value: props.value, onInput: (event: Event) => emit("update:value", Number((event.target as HTMLInputElement).value)) }) });
const Table = defineComponent({ props: ["dataSource", "columns"], setup: (props, { slots }) => () =>
  h("div", props.dataSource?.flatMap((record: any) => props.columns.map((column: any) => slots.bodyCell?.({ record, column })))) });
const stubs: Record<string, any> = Object.fromEntries(["AModal", "ATabs", "ATabPane", "AForm", "AFormItem", "ASpin", "ASelect", "ASelectOption", "ASpace", "ATag"].map((name) => [name, Box]));
Object.assign(stubs, { AButton: Button, AInput: Input, AInputNumber: NumberInput, ATable: Table,
  AAlert: defineComponent({ props: ["message"], setup: (props) => () => h("p", props.message) }), AEmpty: Box });
beforeEach(() => {
  vi.clearAllMocks(); api.list.mockResolvedValue(ref([])); api.create.mockResolvedValue(ref(job));
  api.detail.mockResolvedValue(ref(job)); api.cancel.mockResolvedValue(ref(job));
});
const render = () => mount(RestartNoticeDialog, { global: { stubs } });
describe("restart notification dialog", () => {
  it("disables creation with no selection and uses 15 seconds initially", async () => {
    const wrapper = render(); wrapper.vm.openDialog(); await flushPromises();
    expect(wrapper.get('[data-testid="confirm-notice"]').attributes("disabled")).toBeDefined();
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe("15");
    wrapper.unmount();
  });
  it("shows a frozen selected list and submits edited notification", async () => {
    const wrapper = render(); const selected = [{ daemonId: "node", instanceUuid: "instance", name: "Game" }];
    wrapper.vm.openDialog(selected); selected[0].name = "Changed elsewhere"; await flushPromises();
    expect(wrapper.find(".notice-targets").text()).toContain("Game");
    expect(wrapper.find(".notice-targets").text()).not.toContain("Changed elsewhere");
    await wrapper.get('input[type="number"]').setValue("90");
    await wrapper.findAll("input")[1].setValue("Maintenance");
    await wrapper.get('[data-testid="confirm-notice"]').trigger("click"); await flushPromises();
    expect(api.create).toHaveBeenCalledWith({ data: { targets: [{ daemonId: "node", instanceUuid: "instance" }], seconds: 90, message: "Maintenance" } });
    expect(wrapper.text()).toContain("TXT_CODE_restartNotice.state_skipped");
    expect(wrapper.text()).toContain("TXT_CODE_restartNotice.reason_notSupported"); wrapper.unmount();
  });
  it("prepares failed targets for explicit reconfirmation rather than automatically retrying", async () => {
    api.list.mockResolvedValue(ref([job])); const wrapper = render(); wrapper.vm.openDialog(); await flushPromises();
    await wrapper.get('[data-testid="retry-notice"]').trigger("click");
    expect(api.create).not.toHaveBeenCalled();
    expect(wrapper.find(".notice-targets").text()).toContain("Game");
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe("90");
    await wrapper.get('[data-testid="confirm-notice"]').trigger("click"); await flushPromises();
    expect(api.create).toHaveBeenCalledOnce(); wrapper.unmount();
  });
});
