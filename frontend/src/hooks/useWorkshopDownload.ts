import { onScopeDispose, ref } from "vue";
import { readWorkshopInstance, requestWorkshopDownload, type WorkshopTarget } from "@/services/apis/workshop";

export type WorkshopState = "pending" | "running" | "accepted" | "skipped" | "failed" | "uncertain";
export interface WorkshopRow extends WorkshopTarget { key: string; state: WorkshopState; reason: string }
const validId = (id: string) => /^[a-f0-9]{32}$/i.test(id);
export function workshopTargets(targets: WorkshopTarget[]) {
  return [...new Map(targets.map((target) => [`${target.daemonId}:${target.instanceUuid}`, { ...target }])).values()];
}

export function useWorkshopDownload(deps = { read: readWorkshopInstance, send: requestWorkshopDownload }) {
  const running = ref(false);
  const rows = ref<WorkshopRow[]>([]);
  let controller: AbortController | undefined;
  let disposed = false;
  let nextStart = 0;
  let gate = Promise.resolve();

  // Serialize request starts, including preflight reads, across both workers.
  async function paced<T>(action: () => Promise<T>, signal: AbortSignal) {
    const turn = gate.then(async () => {
      if (signal.aborted) throw new Error("canceled");
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("canceled")); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, Math.max(0, nextStart - Date.now()));
        signal.addEventListener("abort", abort, { once: true });
      });
      if (signal.aborted) throw new Error("canceled");
      nextStart = Date.now() + 200;
    });
    gate = turn.catch(() => {});
    await turn;
    return action();
  }
  async function run(targets: WorkshopTarget[], confirm: (count: number) => Promise<boolean>, started?: () => void) {
    if (running.value || disposed) return false;
    const snapshot = workshopTargets(targets);
    if (!snapshot.length || snapshot.length > 200) return false;
    running.value = true;
    try {
      if (!await confirm(snapshot.length) || disposed) return false;
      controller = new AbortController();
      const signal = controller.signal;
      rows.value = snapshot.map((target) => ({ ...target, key: `${target.daemonId}:${target.instanceUuid}`, state: "pending", reason: "queued" }));
      started?.();
      let index = 0;
      async function worker() {
        while (index < rows.value.length) {
          const row = rows.value[index++];
          if (signal.aborted || row.offline || !validId(row.daemonId) || !validId(row.instanceUuid)) {
            row.state = "skipped"; row.reason = signal.aborted ? "canceled" : row.offline ? "offline" : "invalid";
            continue;
          }
          row.state = "running"; row.reason = "checking";
          let sending = false;
          try {
            const instance = await paced(() => deps.read(row, signal), signal);
            if (!instance) throw new Error("Instance unavailable");
            if (instance.status !== 3) { row.state = "skipped"; row.reason = "stopped"; continue; }
            await paced(async () => {
              sending = true; row.reason = "requesting";
              await deps.send(row, signal);
            }, signal);
            row.state = "accepted"; row.reason = "accepted";
          } catch (error) {
            const response = (error as { response?: { status?: number } })?.response;
            // A missing/failed response after dispatch does not prove the command was rejected.
            row.state = sending && (!response || !response.status || response.status >= 500) ? "uncertain" : signal.aborted ? "skipped" : "failed";
            row.reason = row.state === "uncertain" ? "uncertain" : signal.aborted ? "canceled" : "failed";
          }
        }
      }
      await Promise.all([worker(), worker()]);
      return true;
    } finally { running.value = false; controller = undefined; }
  }
  onScopeDispose(() => { disposed = true; controller?.abort(); });
  return { rows, running, run };
}
