import { remoteInstancesGlobal, remoteNodeList, scheduleGlobal } from "@/services/apis";
import type { NodeStatus, Schedule } from "@/types";
import { computed, ref } from "vue";

export const instanceKey = (daemonId: string, instanceUuid: string) =>
  JSON.stringify([daemonId, instanceUuid]);
export const scheduleKey = (daemonId: string, instanceUuid: string, name: string) =>
  JSON.stringify([daemonId, instanceUuid, name]);

export interface ScheduleInstance {
  key: string;
  daemonId: string;
  nodeName: string;
  instanceUuid: string;
  instanceName: string;
  nodeAvailable: boolean;
  instanceStatus: number;
  tasks: Schedule[];
  planError: boolean;
}
export interface ScheduleRow extends ScheduleInstance {
  task: Schedule;
}

export function useScheduleInventory() {
  const rows = ref<ScheduleInstance[]>([]);
  const nodes = ref<NodeStatus[]>([]);
  const loading = ref(false);
  const excludedNodes = ref<string[]>([]);
  const selectedInstances = ref<string[]>([]);
  const selectedSchedules = ref<string[]>([]);
  const removedSelections = ref(0);
  const schedules = computed<ScheduleRow[]>(() =>
    rows.value.flatMap((row) =>
      row.tasks.map((task) => ({
        ...row,
        key: scheduleKey(row.daemonId, row.instanceUuid, task.name),
        task
      }))
    )
  );
  let pending: Promise<void> | undefined;

  async function read() {
    loading.value = true;
    try {
      const nodeApi = remoteNodeList();
      const instanceApi = remoteInstancesGlobal();
      const planApi = scheduleGlobal();
      const fresh = { forceRequest: true, timeout: 30000 };
      await Promise.all([
        nodeApi.execute(fresh),
        instanceApi.execute({ ...fresh, params: { page: 1, page_size: 50 } }),
        planApi.execute(fresh)
      ]);
      if (!Array.isArray(nodeApi.state.value) || !instanceApi.state.value || !planApi.state.value) {
        throw new Error("Invalid schedule inventory response");
      }
      const all = Object.fromEntries(
        Object.entries(instanceApi.state.value).map(([id, entry]) => [
          id,
          {
            ...entry,
            instances: [...(entry.instances || [])]
          }
        ])
      );
      const badNodes = new Set<string>();
      for (const [id, entry] of Object.entries(all)) if (entry.error) badNodes.add(id);
      const maxPage = Math.max(1, ...Object.values(all).map((entry) => entry.maxPage || 1));
      for (let page = 2; page <= maxPage; page++) {
        await instanceApi.execute({ ...fresh, params: { page, page_size: 50 } });
        for (const [id, previous] of Object.entries(all)) {
          if (page > previous.maxPage) continue;
          const entry = instanceApi.state.value?.[id];
          if (!entry || entry.error) {
            badNodes.add(id);
            continue;
          }
          previous.instances.push(...(entry.instances || []));
        }
      }
      const nodeList = nodeApi.state.value;
      const plans = planApi.state.value;
      const nameOf = (id: string) => {
        const node = nodeList.find((n) => n.uuid === id);
        return node?.remarks || node?.ip || id;
      };
      const taskMap = new Map<string, Schedule[]>();
      for (const [id, entry] of Object.entries(plans))
        for (const task of entry.tasks || []) {
          const key = instanceKey(id, task.instanceUuid);
          taskMap.set(key, [...(taskMap.get(key) || []), task]);
        }
      for (const node of nodeList) {
        if (!all[node.uuid] || !plans[node.uuid]?.available || plans[node.uuid]?.error)
          badNodes.add(node.uuid);
      }
      const built = new Map<string, ScheduleInstance>();
      for (const [id, entry] of Object.entries(all)) {
        if (!plans[id]?.available || plans[id]?.error) badNodes.add(id);
        for (const inst of entry.instances || []) {
          const key = instanceKey(id, inst.instanceUuid);
          built.set(key, {
            key,
            daemonId: id,
            nodeName: nameOf(id),
            instanceUuid: inst.instanceUuid,
            instanceName: inst.config?.nickname || inst.instanceUuid,
            nodeAvailable: plans[id]?.available ?? false,
            instanceStatus: inst.status,
            tasks: taskMap.get(key) || [],
            planError: badNodes.has(id)
          });
        }
      }
      rows.value = [...built.values()];
      nodes.value = nodeList;
      excludedNodes.value = [...badNodes].map(nameOf);
      const before = selectedInstances.value.length + selectedSchedules.value.length;
      const keys = new Set(built.keys());
      const taskKeys = new Set(schedules.value.map((row) => row.key));
      selectedInstances.value = selectedInstances.value.filter((key) => keys.has(key));
      selectedSchedules.value = selectedSchedules.value.filter((key) => taskKeys.has(key));
      removedSelections.value =
        before - selectedInstances.value.length - selectedSchedules.value.length;
    } finally {
      loading.value = false;
    }
  }
  function load() {
    if (!pending)
      pending = read().finally(() => {
        pending = undefined;
      });
    return pending;
  }
  return {
    rows,
    nodes,
    schedules,
    loading,
    excludedNodes,
    selectedInstances,
    selectedSchedules,
    removedSelections,
    load
  };
}
