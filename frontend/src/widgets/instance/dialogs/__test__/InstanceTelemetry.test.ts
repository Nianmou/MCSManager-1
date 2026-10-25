// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import Telemetry from "../../InstanceTelemetry.vue";
import type { InstanceDetail } from "@/types";
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
describe("instance telemetry display", () => {
  it("labels AddonsManager metadata and distinguishes confirmed absence, old responses and stale instances", async () => {
    const target = { status: 3, info: { cs2: { state: "available", checkedAt: Date.now(), players: 0,
      pluginVersion: "2.0.0.15", platformVersion: "1.5.0", addonsManager: { state: "loaded", version: "v1.2.3" } } } } as InstanceDetail;
    const wrapper = mount(Telemetry, { props: { instance: target, field: "versions" } });
    expect(wrapper.text()).toContain("TXT_CODE_cs2.addonsManagerVersion: v1.2.3");
    for (const [addonsManager, expected] of [
      [{ state: "not_loaded" }, "TXT_CODE_cs2.notLoaded"],
      [undefined, "TXT_CODE_cs2.unknown"],
      [{ state: "loaded", version: "bad\nversion" }, "TXT_CODE_cs2.unknown"]
    ] as const) {
      await wrapper.setProps({ instance: { ...target, info: { ...target.info,
        cs2: { ...target.info.cs2!, addonsManager } } } });
      expect(wrapper.text()).toContain(`TXT_CODE_cs2.addonsManagerVersion: ${expected}`);
      expect(wrapper.text()).toContain("2.0.0.15");
    }
    for (const patch of [{ status: 0 }, { info: { ...target.info, cs2: { ...target.info.cs2!, checkedAt: Date.now() - 31000 } } }]) {
      await wrapper.setProps({ instance: { ...target, ...patch } });
      expect(wrapper.text()).not.toContain("v1.2.3");
      expect(wrapper.text()).toContain("TXT_CODE_cs2.addonsManagerVersion: TXT_CODE_cs2.unknown");
    }
    wrapper.unmount();
  });
  const instance = { status: 3, info: { cs2: { state: "available", checkedAt: Date.now(),
    players: 0, pluginVersion: "2.0.0.11", platformVersion: "1.5.0" } } } as InstanceDetail;
  it("renders zero, both versions, and unavailable state when stopped", async () => {
    const wrapper = mount(Telemetry, { props: { instance, field: "players" } });
    expect(wrapper.text()).toContain("0");
    await wrapper.setProps({ field: "versions" });
    expect(wrapper.text()).toContain("2.0.0.11"); expect(wrapper.text()).toContain("1.5.0");
    await wrapper.setProps({ instance: { ...instance, status: 0 } });
    expect(wrapper.text()).not.toContain("2.0.0.11"); expect(wrapper.text()).toContain("TXT_CODE_cs2.unknown");
    wrapper.unmount();
  });
  it("identifies missing RCON configuration without inventing player counts or loaded versions", async () => {
    const config = { type: "steam/universal", enableRcon: false, rconPort: 0, rconPassword: "" };
    const wrapper = mount(Telemetry, { props: {
      instance: { status: 3, config, info: {} } as InstanceDetail, field: "players"
    } });
    expect(wrapper.text()).toContain("TXT_CODE_cs2.rconNotConfigured");
    await wrapper.setProps({ field: "versions" });
    expect(wrapper.text()).toContain("TXT_CODE_cs2.rconNotConfigured");
    expect(wrapper.text()).not.toContain("2.0.0.11");
    for (const patch of [
      { enableRcon: true, rconPort: 0, rconPassword: "configured" },
      { enableRcon: true, rconPort: 27015, rconPassword: "" }
    ]) {
      await wrapper.setProps({ instance: { status: 3, config: { ...config, ...patch }, info: {} } as InstanceDetail });
      expect(wrapper.text()).toContain("TXT_CODE_cs2.rconNotConfigured");
    }
    await wrapper.setProps({ instance: { status: 3,
      config: { ...config, enableRcon: true, rconPort: 27015, rconPassword: "configured" }, info: {} } as InstanceDetail });
    expect(wrapper.text()).toContain("TXT_CODE_cs2.unknown");
    expect(wrapper.text()).not.toContain("TXT_CODE_cs2.rconNotConfigured");
    wrapper.unmount();
  });
  it("does not diagnose missing RCON for stopped instances or Minecraft player queries", () => {
    for (const target of [
      { status: 0, config: { type: "steam/universal", enableRcon: false }, info: {} },
      { status: 3, config: { type: "minecraft/java", enableRcon: false },
        info: { mcPingOnline: true, currentPlayers: 4, maxPlayers: 20 } }
    ]) {
      const wrapper = mount(Telemetry, { props: { instance: target as InstanceDetail, field: "players" } });
      expect(wrapper.text()).not.toContain("TXT_CODE_cs2.rconNotConfigured");
      if (target.status === 3) expect(wrapper.text()).toContain("4 / 20");
      wrapper.unmount();
    }
  });
});
