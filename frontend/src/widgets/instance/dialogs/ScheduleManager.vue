<script setup lang="ts">
import {
  remoteInstancesGlobal,
  remoteNodeList,
  scheduleGlobal
} from "@/services/apis";
import { batchRestart, scheduleDelete } from "@/services/apis/instance";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import type { NodeStatus, Schedule } from "@/types";
import { INSTANCE_STATUS_CODE } from "@/types/const";
import { ScheduleActionType, ScheduleType } from "@/types/const";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { computed, nextTick, ref } from "vue";
import NewSchedule from "@/widgets/instance/dialogs/NewSchedule.vue";

interface PlanRow {
  key: string;
  daemonId: string;
  nodeName: string;
  instanceUuid: string;
  instanceName: string;
  nodeAvailable: boolean;
  instanceStatus: INSTANCE_STATUS_CODE;
  tasks: Schedule[];
}

const open = ref(false);
const loading = ref(false);
const rows = ref<PlanRow[]>([]);
const selectedRowKeys = ref<string[]>([]);
const restarting = ref(false);

// Target instance for the reused NewSchedule dialog (remounted via :key on change).
const curDaemonId = ref("");
const curInstanceId = ref("");
const newScheduleRef = ref<InstanceType<typeof NewSchedule>>();

const instanceStatusText = (s: INSTANCE_STATUS_CODE) => {
  switch (s) {
    case INSTANCE_STATUS_CODE.RUNNING:
      return "运行中";
    case INSTANCE_STATUS_CODE.STARTING:
      return "启动中";
    case INSTANCE_STATUS_CODE.STOPPING:
      return "停止中";
    case INSTANCE_STATUS_CODE.BUSY:
      return "忙碌";
    default:
      return "已停止";
  }
};

const actionLabels = (task: Schedule) =>
  (task.actions || [])
    .map((a) => ScheduleActionType[a.type as keyof typeof ScheduleActionType] ?? a.type)
    .join(" + ") || "-";

const timeText = (task: Schedule) => {
  const time = String(task.time ?? "");
  if (task.type === 1) return `每 ${time} 秒`;
  if (task.type === 2) {
    const [s, m, h, , , w] = time.split(" ");
    return `周期 周${w ?? "?"} ${h}:${m}:${s}`;
  }
  if (task.type === 3) {
    const [s, m, h, dd, mm] = time.split(" ");
    return `指定 ${mm}/${dd} ${h}:${m}:${s}`;
  }
  return time;
};

const columns = [
  { title: "节点", dataIndex: "nodeName", key: "nodeName", width: 160 },
  { title: "实例", dataIndex: "instanceName", key: "instanceName", width: 200 },
  { title: "状态", key: "status", width: 130 },
  { title: "计划任务", key: "tasks", minWidth: 320 },
  { title: "操作", key: "op", width: 130 }
];

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => (selectedRowKeys.value = keys)
}));

const rowClassName = (record: PlanRow) => (record.nodeAvailable ? "" : "plan-row-down");

const unreachableSelectedCount = computed(
  () => rows.value.filter((r) => selectedRowKeys.value.includes(r.key) && !r.nodeAvailable).length
);

async function loadData() {
  loading.value = true;
  try {
    const { execute: getNodes, state: nodeList } = remoteNodeList();
    const { execute: getInstances, state: globalInstances } = remoteInstancesGlobal();
    const { execute: getPlans, state: planMap } = scheduleGlobal();

    await Promise.all([
      getNodes(),
      getInstances({ params: { page: 1, page_size: 50 } }),
      getPlans()
    ]);

    const nodes: NodeStatus[] = nodeList.value || [];
    const nodeNameOf = (uuid: string) => {
      const n = nodes.find((x) => x.uuid === uuid);
      return n?.remarks || n?.ip || uuid.slice(0, 8);
    };

    // Group all scheduled tasks by instanceUuid.
    const tasksByInstance = new Map<string, Schedule[]>();
    const availableByNode = new Map<string, boolean>();
    for (const [daemonId, entry] of Object.entries(planMap.value || {})) {
      availableByNode.set(daemonId, entry.available);
      for (const task of entry.tasks || []) {
        const arr = tasksByInstance.get(task.instanceUuid) || [];
        arr.push(task);
        tasksByInstance.set(task.instanceUuid, arr);
      }
    }

    const built: PlanRow[] = [];
    for (const [daemonId, entry] of Object.entries(globalInstances.value || {})) {
      const nodeAvailable = availableByNode.get(daemonId) ?? !entry.error;
      for (const inst of entry.instances || []) {
        built.push({
          key: `${daemonId}:${inst.instanceUuid}`,
          daemonId,
          nodeName: nodeNameOf(daemonId),
          instanceUuid: inst.instanceUuid,
          instanceName: inst.config?.nickname || inst.instanceUuid,
          nodeAvailable,
          instanceStatus: inst.status,
          tasks: tasksByInstance.get(inst.instanceUuid) || []
        });
      }
    }

    rows.value = built;
    // Auto-preselect instances on unreachable nodes ("挂了"), per the chosen down-definition.
    selectedRowKeys.value = built.filter((r) => !r.nodeAvailable).map((r) => r.key);
  } catch (err: any) {
    reportErrorMsg(err?.message ?? String(err));
  } finally {
    loading.value = false;
  }
}

function openDialog() {
  open.value = true;
  loadData();
}

async function openCreate(row: PlanRow) {
  curDaemonId.value = row.daemonId;
  curInstanceId.value = row.instanceUuid;
  open.value = true;
  await nextTick();
  newScheduleRef.value?.openDialog();
}

async function openEdit(row: PlanRow, task: Schedule) {
  curDaemonId.value = row.daemonId;
  curInstanceId.value = row.instanceUuid;
  await nextTick();
  newScheduleRef.value?.openDialog(task);
}

async function onDeleteTask(row: PlanRow, task: Schedule) {
  try {
    const { execute } = scheduleDelete();
    await execute({
      params: { daemonId: row.daemonId, uuid: row.instanceUuid, task_name: task.name }
    });
    message.success(t("TXT_CODE_fbde647e"));
    await loadData();
  } catch (err: any) {
    reportErrorMsg(err?.message ?? String(err));
  }
}

async function onBatchRestart() {
  const selected = rows.value.filter((r) => selectedRowKeys.value.includes(r.key));
  if (selected.length === 0) return message.warning("请先勾选要重启的实例");
  // Only instances on reachable nodes can actually be restarted.
  const reachable = selected.filter((r) => r.nodeAvailable);
  const skipped = selected.length - reachable.length;
  if (reachable.length === 0) {
    return message.warning("所选实例的节点均不可达，无法下发重启");
  }
  restarting.value = true;
  try {
    const { execute } = batchRestart();
    await execute({
      data: reachable.map((r) => ({ instanceUuid: r.instanceUuid, daemonId: r.daemonId }))
    });
    message.success(`已下发重启 ${reachable.length} 个${skipped ? `，跳过不可达 ${skipped} 个` : ""}`);
    await loadData();
  } catch (err: any) {
    reportErrorMsg(err?.message ?? String(err));
  } finally {
    restarting.value = false;
  }
}

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" title="整体计划管理" width="1100px" :footer="null" destroy-on-close>
    <div class="mb-12">
      <a-alert
        type="info"
        show-icon
        message="跨节点汇总每个实例的定时计划（含重启）。节点不可达的实例已自动预选并高亮——它们无法直接重启，预选是为了让你尽快为其补上/检查重启计划；重启只会下发到节点在线的实例。"
      />
    </div>

    <div class="toolbar mb-12">
      <a-space>
        <a-button :loading="loading" @click="loadData">
          <ReloadOutlined />
          刷新
        </a-button>
        <a-popconfirm
          :title="`确认重启已选的 ${selectedRowKeys.length} 个实例？（节点不可达的会自动跳过）`"
          ok-text="确认重启"
          cancel-text="取消"
          @confirm="onBatchRestart"
        >
          <a-button type="primary" danger :loading="restarting" :disabled="selectedRowKeys.length === 0">
            批量重启已选（{{ selectedRowKeys.length }}）
          </a-button>
        </a-popconfirm>
        <span v-if="unreachableSelectedCount" class="warn-text">
          其中 {{ unreachableSelectedCount }} 个节点不可达，将被跳过
        </span>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-table
        :data-source="rows"
        :columns="columns"
        :row-key="(r: PlanRow) => r.key"
        :row-selection="rowSelection"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        :pagination="{ pageSize: 15 }"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag v-if="!record.nodeAvailable" color="error">节点不可达</a-tag>
            <a-tag v-else-if="record.instanceStatus === INSTANCE_STATUS_CODE.RUNNING" color="success">
              {{ instanceStatusText(record.instanceStatus) }}
            </a-tag>
            <a-tag v-else color="default">{{ instanceStatusText(record.instanceStatus) }}</a-tag>
          </template>

          <template v-else-if="column.key === 'tasks'">
            <span v-if="!record.tasks.length" class="muted">无计划</span>
            <div v-for="task in record.tasks" :key="task.name" class="task-line">
              <a-tag color="blue">{{ task.name }}</a-tag>
              <span class="task-detail">
                {{ actionLabels(task) }} · {{ timeText(task) }} ·
                {{ ScheduleType[task.type as keyof typeof ScheduleType] ?? task.type }} ·
                剩余 {{ Number(task.count) > 0 ? task.count : "无限" }}
              </span>
              <a-button size="small" type="link" @click="openEdit(record, task)">编辑</a-button>
              <a-popconfirm title="确认删除该计划？" ok-text="删除" cancel-text="取消" @confirm="onDeleteTask(record, task)">
                <a-button size="small" type="link" danger>
                  <DeleteOutlined />
                </a-button>
              </a-popconfirm>
            </div>
          </template>

          <template v-else-if="column.key === 'op'">
            <a-button size="small" @click="openCreate(record)">
              <PlusOutlined />
              新建计划
            </a-button>
          </template>
        </template>
      </a-table>
    </a-spin>
  </a-modal>

  <NewSchedule
    :key="`${curDaemonId}:${curInstanceId}`"
    ref="newScheduleRef"
    :daemon-id="curDaemonId"
    :instance-id="curInstanceId"
    @get-schedule-list="loadData"
  />
</template>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  align-items: center;
}
.warn-text {
  color: #d4380d;
  font-size: 13px;
}
.muted {
  color: #999;
}
.task-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  flex-wrap: wrap;
}
.task-detail {
  font-size: 13px;
  color: #555;
}
:deep(.plan-row-down) {
  background: #fff1f0;
}
</style>
