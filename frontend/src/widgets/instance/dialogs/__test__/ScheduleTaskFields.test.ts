// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import Fields from "../ScheduleTaskFields.vue";
import { newScheduleDraft } from "@/tools/schedule";
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/hooks/useInstance", () => ({ TYPE_UNIVERSAL: "universal" }));
const Slot = defineComponent({ setup: (_, { slots }) => () => h("div", slots.default?.()) });
const Select = defineComponent({ name: "ASelect", props: ["value"], emits: ["update:value"],
  setup: (_, { slots }) => () => h("select", slots.default?.()) });
const Option = defineComponent({ name: "ASelectOption", props: ["value"],
  setup: (props, { slots }) => () => h("option", { value: props.value }, slots.default?.()) });
const Input = defineComponent({ name: "AInput", props: ["value"], emits: ["update:value"],
  setup: (props) => () => h("input", { value: props.value }) });
function setup(type = "command") {
  const draft = newScheduleDraft(); draft.actions = [{ type, payload: "" }];
  return mount(Fields, { props: { modelValue: draft, editMode: type === "restart" }, global: { stubs: {
    ASelect: Select, ASelectOption: Option, AFormItem: Slot, ARow: Slot, ACol: Slot, ASpace: Slot,
    ATypographyTitle: Slot, ATypographyParagraph: Slot, ATypographyText: Slot,
    AInput: Input, AInputNumber: Input, AButton: Slot, Flex: Slot
  } } });
}
describe("schedule restart selection", () => {
  it("offers notified restarts for new plans, starts at 15 seconds and serializes edits", async () => {
    const wrapper = setup();
    expect(wrapper.find('option[value="restart"]').exists()).toBe(false);
    expect(wrapper.find('option[value="restart_notice"]').exists()).toBe(true);
    wrapper.findAllComponents(Select)[1].vm.$emit("update:value", "restart_notice");
    const value = wrapper.emitted("update:modelValue")![0][0] as ReturnType<typeof newScheduleDraft>;
    expect(JSON.parse(value.actions[0].payload).seconds).toBe(15);
    await wrapper.setProps({ modelValue: value }); await flushPromises();
    expect(wrapper.find('[data-testid="schedule-notice-seconds"]').exists()).toBe(true);
    const inputs = wrapper.findAllComponents(Input);
    inputs[inputs.length - 1].vm.$emit("update:value", "Restart soon");
    const updated = wrapper.emitted("update:modelValue")!.at(-1)![0] as typeof value;
    expect(JSON.parse(updated.actions[0].payload)).toEqual({ seconds: 15, message: "Restart soon" });
    wrapper.unmount();
  });
  it("identifies legacy immediate restart without silently changing it", () => {
    const wrapper = setup("restart");
    expect(wrapper.find('option[value="restart"]').text()).toBe("TXT_CODE_scheduleNotice.legacyRestart");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined(); wrapper.unmount();
  });
});
