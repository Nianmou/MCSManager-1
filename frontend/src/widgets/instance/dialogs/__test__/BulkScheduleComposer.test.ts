// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import BulkScheduleComposer from "../BulkScheduleComposer.vue";
import { newScheduleDraft } from "@/tools/schedule";
import { reportErrorMsg } from "@/tools/validator";
vi.mock("@/hooks/useInstance", () => ({ TYPE_UNIVERSAL: "universal" }));
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/tools/validator", () => ({ reportErrorMsg: vi.fn() }));
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.())
});
const Modal = defineComponent({
  name: "AModal",
  emits: ["ok"],
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.())
});
const Fields = defineComponent({
  name: "ScheduleTaskFields",
  props: ["modelValue"],
  emits: ["update:modelValue"],
  setup: () => () => h("div")
});
const Button = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("button", slots.default?.())
});
function setup() {
  const wrapper = mount(BulkScheduleComposer, {
    props: { selectedCount: 2, allCount: 51, loading: false },
    global: {
      stubs: {
        AModal: Modal,
        AAlert: Slot,
        ARadioGroup: Slot,
        ARadioButton: Slot,
        ASpace: Slot,
        AButton: Button,
        ScheduleTaskFields: Fields
      }
    }
  });
  (wrapper.vm as any).openDialog("all");
  return wrapper;
}
describe("bulk schedule composer", () => {
  it("validates drafts before emitting and rejects duplicate names", async () => {
    const wrapper = setup();
    await flushPromises();
    wrapper.findComponent(Modal).vm.$emit("ok");
    await flushPromises();
    expect(wrapper.emitted("prepare")).toBeUndefined();
    const draft = newScheduleDraft();
    draft.name = "nightly";
    draft.cycle = ["30", "0", "0"];
    wrapper.findComponent(Fields).vm.$emit("update:modelValue", draft);
    await flushPromises();
    const duplicate = wrapper
      .findAll("button")
      .find((component) => component.text() === "TXT_CODE_scheduleManager.duplicate");
    expect(duplicate).toBeDefined();
    await duplicate!.trigger("click");
    await flushPromises();
    wrapper.findComponent(Modal).vm.$emit("ok");
    await flushPromises();
    expect(wrapper.emitted("prepare")).toBeUndefined();
    expect(reportErrorMsg).toHaveBeenLastCalledWith("TXT_CODE_scheduleManager.duplicateDraft");
    const second = { ...draft, name: "second" };
    wrapper.findAllComponents(Fields)[1].vm.$emit("update:modelValue", second);
    await flushPromises();
    wrapper.findComponent(Modal).vm.$emit("ok");
    await flushPromises();
    expect(wrapper.emitted("prepare")?.[0][0]).toBe("all");
    expect((wrapper.emitted("prepare")?.[0][1] as any[]).map((p) => p.name)).toEqual([
      "nightly",
      "second"
    ]);
    wrapper.unmount();
  });
});
