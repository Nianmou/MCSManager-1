import { scheduleCreate, scheduleDelete } from "@/services/apis/instance";
import type { SchedulePayload } from "@/tools/schedule";
import { t } from "@/lang/i18n";
import { computed, onScopeDispose, ref } from "vue";
import { instanceKey, type ScheduleInstance, type ScheduleRow } from "./useScheduleInventory";

export type BulkStatus =
  | "pending"
  | "running"
  | "success"
  | "conflict"
  | "skipped"
  | "failed"
  | "uncertain";
export interface ScheduleOperation {
  key: string;
  target: ScheduleInstance;
  name: string;
  kind: "create" | "delete";
  payload?: SchedulePayload;
  status: BulkStatus;
  detail: string;
}

export function createOperations(
  targets: ScheduleInstance[],
  drafts: SchedulePayload[]
): ScheduleOperation[] {
  return targets.flatMap((target) =>
    drafts.map((draft) => ({
      key: JSON.stringify([target.daemonId, target.instanceUuid, draft.name]),
      target: { ...target, tasks: target.tasks.map((task) => ({ ...task })) },
      name: draft.name,
      kind: "create" as const,
      payload: { ...draft, actions: draft.actions.map((a) => ({ ...a })) },
      status: "pending" as const,
      detail: ""
    }))
  );
}
export function deleteOperations(rows: ScheduleRow[]): ScheduleOperation[] {
  return rows.map((row) => ({
    key: row.key,
    target: { ...row },
    name: row.task.name,
    kind: "delete",
    status: "pending",
    detail: ""
  }));
}

export function useBulkSchedules() {
  const running = ref(false);
  const results = ref<ScheduleOperation[]>([]);
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });
  const completed = computed(
    () => results.value.filter((r) => !["pending", "running"].includes(r.status)).length
  );
  const retryable = computed(() =>
    results.value.filter((r) => ["failed", "uncertain", "skipped"].includes(r.status))
  );

  async function run(operations: ScheduleOperation[], preserve = false) {
    if (running.value || disposed) return;
    running.value = true;
    const replacement = new Map(operations.map((op) => [op.key, op]));
    results.value = preserve
      ? results.value.map((old) => replacement.get(old.key) || old)
      : operations;
    const groups = new Map<string, ScheduleOperation[]>();
    for (const op of results.value.filter((op) => op.status === "pending")) {
      const key = instanceKey(op.target.daemonId, op.target.instanceUuid);
      groups.set(key, [...(groups.get(key) || []), op]);
    }
    const queue = [...groups.values()];
    let next = 0;
    try {
      await Promise.all(
        Array.from({ length: Math.min(5, queue.length) }, async () => {
          while (!disposed && next < queue.length) {
            const group = queue[next++];
            const names = new Set(group[0].target.tasks.map((task) => task.name));
            for (const op of group) {
              if (disposed) break;
              if (op.status !== "pending") continue;
              if (!op.target.nodeAvailable || op.target.planError) {
                op.status = "skipped";
                op.detail = t("TXT_CODE_scheduleManager.unreadable");
                continue;
              }
              if (op.kind === "create" && names.has(op.name)) {
                op.status = "conflict";
                op.detail = t("TXT_CODE_scheduleManager.nameConflict");
                continue;
              }
              if (op.kind === "create" && names.size >= 8) {
                op.status = "failed";
                op.detail = t("TXT_CODE_scheduleManager.capacity");
                continue;
              }
              if (op.kind === "delete" && !names.has(op.name)) {
                op.status = "skipped";
                op.detail = t("TXT_CODE_scheduleManager.absent");
                continue;
              }
              op.status = "running";
              try {
                const params = { daemonId: op.target.daemonId, uuid: op.target.instanceUuid };
                const config = { forceRequest: true, timeout: 30000, errorAlert: false };
                const result =
                  op.kind === "create"
                    ? await scheduleCreate().execute({ ...config, params, data: op.payload! })
                    : await scheduleDelete().execute({
                        ...config,
                        params: { ...params, task_name: op.name }
                      });
                if (result.value !== true) {
                  op.status = "uncertain";
                  op.detail = t("TXT_CODE_scheduleManager.uncertain");
                } else {
                  op.status = "success";
                  if (op.kind === "create") names.add(op.name);
                  else names.delete(op.name);
                }
              } catch (error: any) {
                // The API layer can erase transport metadata. A rejected request may have had an effect.
                op.status = "uncertain";
                op.detail = error?.message || t("TXT_CODE_scheduleManager.uncertain");
              }
            }
          }
        })
      );
    } finally {
      running.value = false;
    }
  }

  function prepareRetry(rows: ScheduleInstance[]): ScheduleOperation[] {
    const current = new Map(rows.map((row) => [instanceKey(row.daemonId, row.instanceUuid), row]));
    return retryable.value.map((old) => {
      const target = current.get(instanceKey(old.target.daemonId, old.target.instanceUuid));
      return {
        ...old,
        target: target || { ...old.target, nodeAvailable: false, planError: true },
        status: "pending" as const,
        detail: ""
      };
    });
  }
  return { running, results, completed, retryable, run, prepareRetry };
}
