// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeploymentDialog from "../DeploymentDialog.vue";
import type { DeploymentTarget } from "../workflow";

const api = vi.hoisted(() => ({
  admin: true,
  discover: vi.fn(),
  prepare: vi.fn(),
  apply: vi.fn(),
  retry: vi.fn()
}));
vi.mock("@/lang/i18n", () => ({
  t: (key: string, params?: unknown) => key + (params ? JSON.stringify(params) : "")
}));
vi.mock("@/stores/useAppStateStore", () => ({
  useAppStateStore: () => ({ isAdmin: ref(api.admin) })
}));
vi.mock("../transport", () => ({ createDeploymentTransport: () => ({ discover: api.discover }) }));
vi.mock("../workflow", async (original) => ({
  ...(await original<typeof import("../workflow")>()),
  prepareDeployment: (...args: unknown[]) => api.prepare(...args),
  refreshUnresolvedDeployments: (...args: unknown[]) => api.retry(...args),
  DeploymentRunner: class {
    applyBatch = api.apply;
    cancel = vi.fn();
  }
}));
vi.mock("../package", async (original) => ({
  ...(await original<typeof import("../package")>()),
  readPackageFiles: vi.fn(async () => []),
  normalizePackage: vi.fn(() => ({
    entries: [{ path: "P.dll", bytes: new Uint8Array(3) }],
    bytes: 3,
    mode: "plugin",
    pluginName: "P"
  }))
}));
const Slot = { template: "<div><slot /></div>" };
const Select = defineComponent({
  props: ["value", "options"],
  emits: ["update:value"],
  setup: () => () => h("div")
});
const Radio = defineComponent({
  props: ["value"],
  emits: ["update:value"],
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.())
});
const Checkbox = defineComponent({
  props: ["checked", "disabled"],
  emits: ["update:checked"],
  setup:
    (props, { emit, slots }) =>
    () =>
      h("label", [
        h("input", {
          type: "checkbox",
          checked: props.checked,
          disabled: props.disabled,
          onChange: (event: Event) =>
            emit("update:checked", (event.target as HTMLInputElement).checked)
        }),
        slots.default?.()
      ])
});
const Button = defineComponent({
  props: ["disabled", "loading"],
  setup:
    (props, { slots }) =>
    () =>
      h("button", { disabled: props.disabled || props.loading }, slots.default?.())
});
const Input = defineComponent({
  props: ["value"],
  emits: ["update:value"],
  setup:
    (props, { emit }) =>
    () =>
      h("input", {
        value: props.value,
        onInput: (event: Event) => emit("update:value", (event.target as HTMLInputElement).value)
      })
});
const mountDialog = () =>
  mount(DeploymentDialog, {
    global: {
      stubs: {
        AModal: {
          props: ["title", "open"],
          template: "<div v-if='open'><h1>{{ title }}</h1><slot /></div>"
        },
        ASpace: Slot,
        AAlert: { props: ["message"], template: "<div>{{ message }}</div>" },
        AForm: Slot,
        AFormItem: Slot,
        ASelect: Select,
        ARadioGroup: Radio,
        ARadioButton: Slot,
        AInput: Input,
        ACheckbox: Checkbox,
        AButton: Button,
        ACard: Slot
      }
    }
  });
const target = (id: string, error?: Error): DeploymentTarget => ({
  key: id,
  daemonId: id,
  nodeName: id,
  root: "/game/csgo",
  affected: [{ daemonId: id, instanceUuid: "i", name: id, status: 0 }],
  files: [],
  running: [],
  phase: error ? "failed" : "ready",
  error,
  confirmed: false
});
async function preview(wrapper: ReturnType<typeof mountDialog>) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", {
    value: [new File(["fixture"], "package.zip")],
    configurable: true
  });
  await input.trigger("change");
  await wrapper.find('[data-testid="deployment-preview"]').trigger("click");
  await flushPromises();
}
beforeEach(() => {
  api.admin = true;
  api.discover
    .mockReset()
    .mockResolvedValue({
      nodes: [{ uuid: "a", available: true, remarks: "test node" }],
      instances: [{ daemonId: "a", instanceUuid: "i", name: "CS2", status: 0 }]
    });
  api.prepare
    .mockReset()
    .mockImplementation(async () => [
      target("a"),
      target("b"),
      target("offline", new Error("offline"))
    ]);
  api.apply.mockReset().mockImplementation(async (targets: DeploymentTarget[]) => {
    for (const item of targets) if (item.confirmed && !item.error) item.phase = "success";
  });
  api.retry
    .mockReset()
    .mockImplementation(async (_transport, _pkg, targets: DeploymentTarget[]) =>
      targets.map((item) => (item.phase === "success" ? item : target(item.daemonId)))
    );
});

describe("deployment mode dialog", () => {
  it.each(["platform", "plugin"])(
    "defaults %s to all instances and preserves an explicit selected fallback",
    async (mode) => {
      const wrapper = mountDialog();
      await (wrapper.vm as any).openDialog(mode, [{ daemonId: "a", instanceUuid: "i" }]);
      expect(wrapper.find("h1").text()).toBe(`TXT_CODE_deploy.${mode}`);
      expect(wrapper.findComponent(Radio).props("value")).toBe("all");
      expect(wrapper.findComponent(Select).exists()).toBe(false);
      expect(wrapper.get('[data-testid="deployment-shared-root"]').text()).toBe("/mnt/steam/cs2/game/csgo");
      expect(wrapper.findAllComponents(Input)).toHaveLength(mode === "plugin" ? 1 : 0);
      wrapper.findComponent(Radio).vm.$emit("update:value", "selected");
      await flushPromises();
      expect(wrapper.findComponent(Select).props("value")).toEqual(["a:i"]);
      expect(wrapper.findComponent(Select).props("options")).toEqual([
        { value: "a:i", label: "test node / CS2" }
      ]);
      wrapper.unmount();
    }
  );
  it("requires one approval and starts all eligible destinations once, preserving blocked results", async () => {
    const wrapper = mountDialog();
    await (wrapper.vm as any).openDialog("plugin");
    await preview(wrapper);
    expect(api.prepare.mock.calls[0][2]).toBe("all");
    expect(api.prepare.mock.calls[0][5].instances).toHaveLength(1);
    expect(api.prepare.mock.calls[0][3]).toEqual({ a: "/mnt/steam/cs2/game/csgo" });
    expect(api.prepare.mock.calls[0][6]).toBe(true);
    expect(wrapper.find('[data-testid="deployment-apply"]').attributes("disabled")).toBeDefined();
    await wrapper.find('[data-testid="deployment-confirm"] input').setValue(true);
    expect(wrapper.find('[data-testid="deployment-apply"]').attributes("disabled")).toBeUndefined();
    let finish!: () => void;
    api.apply.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await wrapper.find('[data-testid="deployment-apply"]').trigger("click");
    await wrapper.find('[data-testid="deployment-apply"]').trigger("click");
    expect(api.apply).toHaveBeenCalledTimes(1);
    expect(api.apply.mock.calls[0][0].map((item: DeploymentTarget) => item.confirmed)).toEqual([
      true,
      true,
      false
    ]);
    finish();
    await flushPromises();
    expect(wrapper.text()).toContain('"blocked":1');
    wrapper.unmount();
  });
  it("invalidates an approved preview when scope or destination settings change", async () => {
    const wrapper = mountDialog();
    await (wrapper.vm as any).openDialog("plugin");
    await preview(wrapper);
    await wrapper.find('[data-testid="deployment-confirm"] input').setValue(true);
    await wrapper.findComponent(Input).find("input").setValue("AnotherPlugin");
    expect(wrapper.find('[data-testid="deployment-confirm"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="deployment-apply"]').attributes("disabled")).toBeDefined();
    await preview(wrapper);
    wrapper.findComponent(Radio).vm.$emit("update:value", "selected");
    await flushPromises();
    expect(wrapper.find('[data-testid="deployment-confirm"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it("requires renewed approval after disabling backup and forwards the explicit policy", async () => {
    const wrapper = mountDialog();
    await (wrapper.vm as any).openDialog("platform");
    await preview(wrapper);
    await wrapper.find('[data-testid="deployment-confirm"] input').setValue(true);
    await wrapper.find('[data-testid="deployment-backup"] input').setValue(false);
    expect(wrapper.find('[data-testid="deployment-confirm"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("TXT_CODE_deploy.noBackupWarning");
    await preview(wrapper);
    expect(api.prepare.mock.calls.at(-1)?.[6]).toBe(false);
    expect(wrapper.find('[data-testid="deployment-apply"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("refreshes unresolved targets for a new approval without replaying successful ones", async () => {
    const wrapper = mountDialog();
    await (wrapper.vm as any).openDialog("plugin");
    await preview(wrapper);
    await wrapper.find('[data-testid="deployment-confirm"] input').setValue(true);
    await wrapper.find('[data-testid="deployment-apply"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="deployment-retry"]').trigger("click");
    await flushPromises();
    expect(api.retry).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="deployment-apply"]').attributes("disabled")).toBeDefined();
    await wrapper.find('[data-testid="deployment-confirm"] input').setValue(true);
    await wrapper.find('[data-testid="deployment-apply"]').trigger("click");
    await flushPromises();
    expect(api.apply.mock.calls[1][0].map((item: DeploymentTarget) => item.phase)).toEqual([
      "success",
      "success",
      "success"
    ]);
    wrapper.unmount();
  });
  it("denies regular users before inventory discovery", async () => {
    api.admin = false;
    const wrapper = mountDialog();
    await (wrapper.vm as any).openDialog("plugin");
    expect(api.discover).not.toHaveBeenCalled();
    expect(wrapper.find("h1").exists()).toBe(false);
    wrapper.unmount();
  });
});
