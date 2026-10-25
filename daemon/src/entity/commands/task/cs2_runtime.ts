import type { ILifeCycleTask } from "../../instance/life_cycle";
import type Instance from "../../instance/instance";
import { queryCs2Runtime } from "../../../service/cs2_runtime";

export default class Cs2RuntimeTask implements ILifeCycleTask {
  name = "Cs2Runtime";
  status = 0;
  private controller?: AbortController;
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;
  async start(instance: Instance) {
    void this.stop(instance);
    const controller = this.controller = new AbortController();
    const generation = instance.startCount;
    const update = async () => {
      try {
        const result = await queryCs2Runtime(instance, controller.signal);
        if (!controller.signal.aborted && instance.startCount === generation && instance.status() === 3)
          instance.info.cs2 = result;
      } catch {
        if (!controller.signal.aborted) instance.info.cs2 = { state: "unavailable", checkedAt: Date.now() };
      } finally {
        if (!controller.signal.aborted) this.timer = setTimeout(() => { this.pending = update(); }, 10000);
      }
    };
    this.pending = update();
  }
  async stop(instance: Instance) {
    this.controller?.abort(); this.controller = undefined;
    clearTimeout(this.timer); this.timer = undefined;
    instance.info.cs2 = { state: "unavailable", checkedAt: Date.now() };
    await this.pending;
  }
}
