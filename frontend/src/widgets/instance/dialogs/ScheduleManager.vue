<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { reportErrorMsg } from "@/tools/validator";
import {
  instanceKey,
  useScheduleInventory,
  type ScheduleInstance,
  type ScheduleRow
} from "@/hooks/useScheduleInventory";
import {
  createOperations,
  deleteOperations,
  useBulkSchedules,
  type ScheduleOperation
} from "@/hooks/useBulkSchedules";
import type { SchedulePayload } from "@/tools/schedule";
import { INSTANCE_STATUS, ScheduleActionType, ScheduleType } from "@/types/const";
import type { TableRowSelection } from "ant-design-vue/es/table/interface";
import NewSchedule from "./NewSchedule.vue";
import BulkScheduleComposer from "./BulkScheduleComposer.vue";

const { isAdmin } = useAppStateStore();
const {
  rows,
  nodes,
  schedules,
  loading,
  excludedNodes,
  selectedInstances,
  selectedSchedules,
  removedSelections,
  load
} = useScheduleInventory();
const { running, results, completed, retryable, run, prepareRetry } = useBulkSchedules();
const open = ref(false);
const tab = ref("instances");
const nodeFilter = ref<string>();
const search = ref("");
const composer = ref<InstanceType<typeof BulkScheduleComposer>>();
const editor = ref<InstanceType<typeof NewSchedule>>();
const editTarget = ref<ScheduleInstance>();
const preview = ref<ScheduleOperation[]>([]);
const confirming = ref(false);
const retrying = ref(false);
const preparing = ref(false);
const busy = computed(() => loading.value || running.value || preparing.value);
const matches = (row: ScheduleInstance, name = "") =>
  (!nodeFilter.value || row.daemonId === nodeFilter.value) &&
  [row.nodeName, row.instanceName, row.instanceUuid, name]
    .join(" ")
    .toLowerCase()
    .includes(search.value.toLowerCase());
const filteredInstances = computed(() => rows.value.filter((row) => matches(row)));
const filteredSchedules = computed(() =>
  schedules.value.filter((row) => matches(row, row.task.name))
);
const activeKeys = computed(() =>
  tab.value === "instances" ? selectedInstances.value : selectedSchedules.value
);
const hiddenSelected = computed(() => {
  const visible = new Set(
    (tab.value === "instances" ? filteredInstances.value : filteredSchedules.value).map(
      (row) => row.key
    )
  );
  return activeKeys.value.filter((key) => !visible.has(key)).length;
});
const instanceSelection = computed<TableRowSelection<ScheduleInstance>>(() => ({
  selectedRowKeys: selectedInstances.value,
  preserveSelectedRowKeys: true,
  onChange: (keys) => {
    selectedInstances.value = keys as string[];
  },
  getCheckboxProps: () => ({ disabled: busy.value })
}));
const scheduleSelection = computed<TableRowSelection<ScheduleRow>>(() => ({
  selectedRowKeys: selectedSchedules.value,
  preserveSelectedRowKeys: true,
  onChange: (keys) => {
    selectedSchedules.value = keys as string[];
  },
  getCheckboxProps: () => ({ disabled: busy.value })
}));
const baseColumns = [
  { title: t("TXT_CODE_scheduleManager.node"), dataIndex: "nodeName", key: "node", width: 150 },
  {
    title: t("TXT_CODE_scheduleManager.instance"),
    dataIndex: "instanceName",
    key: "instance",
    width: 170
  }
];
const instanceColumns = [
  ...baseColumns,
  { title: t("TXT_CODE_scheduleManager.status"), key: "status", width: 140 },
  { title: t("TXT_CODE_scheduleManager.schedules"), key: "tasks" },
  { title: t("TXT_CODE_scheduleManager.operations"), key: "operations", width: 120 }
];
const scheduleColumns = [
  ...baseColumns,
  { title: t("TXT_CODE_scheduleManager.name"), key: "name", width: 160 },
  { title: t("TXT_CODE_scheduleManager.trigger"), key: "trigger" },
  { title: t("TXT_CODE_scheduleManager.actions"), key: "actions" },
  { title: t("TXT_CODE_scheduleManager.count"), key: "count", width: 100 },
  { title: t("TXT_CODE_scheduleManager.operations"), key: "operations", width: 140 }
];
const operationColumns = [
  { title: t("TXT_CODE_scheduleManager.node"), key: "node", width: 140 },
  { title: t("TXT_CODE_scheduleManager.instance"), key: "instance", width: 160 },
  { title: t("TXT_CODE_scheduleManager.name"), dataIndex: "name", key: "name", width: 160 },
  { title: t("TXT_CODE_scheduleManager.result"), key: "result", width: 120 },
  { title: t("TXT_CODE_scheduleManager.detail"), key: "detail" }
];
const previewInstanceCount = computed(
  () =>
    new Set(preview.value.map((op) => instanceKey(op.target.daemonId, op.target.instanceUuid))).size
);
const deleting = computed(() => preview.value[0]?.kind === "delete");
const resultStatuses = ["success", "conflict", "skipped", "failed", "uncertain"] as const;
const resultCounts = computed(() =>
  Object.fromEntries(
    resultStatuses.map((status) => [
      status,
      results.value.filter((op) => op.status === status).length
    ])
  )
);
const actionText = (row: ScheduleRow) =>
  row.task.actions
    .map(
      (action) => ScheduleActionType[action.type as keyof typeof ScheduleActionType] || action.type
    )
    .join(" + ");
const triggerText = (row: ScheduleRow) =>
  row.task.type === 1
    ? t("TXT_CODE_scheduleManager.interval", { seconds: row.task.time })
    : String(ScheduleType[row.task.type as keyof typeof ScheduleType] || row.task.type) +
      ": " +
      row.task.time;
function preflightDetail(op: ScheduleOperation) {
  if (!op.target.nodeAvailable || op.target.planError)
    return t("TXT_CODE_scheduleManager.unreadable");
  if (op.kind === "create") {
    if (op.target.tasks.some((task) => task.name === op.name))
      return t("TXT_CODE_scheduleManager.nameConflict");
    const preceding = preview.value
      .slice(0, preview.value.indexOf(op))
      .filter(
        (other) =>
          instanceKey(other.target.daemonId, other.target.instanceUuid) ===
            instanceKey(op.target.daemonId, op.target.instanceUuid) &&
          !op.target.tasks.some((task) => task.name === other.name)
      ).length;
    if (op.target.tasks.length + preceding >= 8) return t("TXT_CODE_scheduleManager.capacity");
  }
  if (op.kind === "delete" && !op.target.tasks.some((task) => task.name === op.name))
    return t("TXT_CODE_scheduleManager.absent");
  return t("TXT_CODE_scheduleManager.ready");
}
async function refresh() {
  if (!isAdmin.value) return false;
  try {
    await load();
    return true;
  } catch (error: any) {
    reportErrorMsg(error.message);
    return false;
  }
}
async function openDialog() {
  if (!isAdmin.value || running.value) return;
  selectedInstances.value = [];
  selectedSchedules.value = [];
  results.value = [];
  search.value = "";
  nodeFilter.value = undefined;
  tab.value = "instances";
  open.value = true;
  await refresh();
}
function selectFiltered() {
  if (tab.value === "instances")
    selectedInstances.value = [
      ...new Set([...selectedInstances.value, ...filteredInstances.value.map((r) => r.key)])
    ];
  else
    selectedSchedules.value = [
      ...new Set([...selectedSchedules.value, ...filteredSchedules.value.map((r) => r.key)])
    ];
}
function clearSelection() {
  if (tab.value === "instances") selectedInstances.value = [];
  else selectedSchedules.value = [];
}
async function prepareCreate(scope: "selected" | "all", drafts: SchedulePayload[]) {
  if (busy.value || !isAdmin.value) return;
  const selected = new Set(selectedInstances.value);
  preparing.value = true;
  try {
    if (!(await refresh())) return;
    const targets =
      scope === "all" ? rows.value : rows.value.filter((row) => selected.has(row.key));
    if (!targets.length) return reportErrorMsg(t("TXT_CODE_scheduleManager.noTargets"));
    preview.value = createOperations(targets, drafts);
    retrying.value = false;
    confirming.value = true;
  } finally {
    preparing.value = false;
  }
}
async function prepareDelete(single?: ScheduleRow) {
  if (busy.value || !isAdmin.value) return;
  const selected = new Set(single ? [single.key] : selectedSchedules.value);
  preparing.value = true;
  try {
    if (!(await refresh())) return;
    preview.value = deleteOperations(schedules.value.filter((row) => selected.has(row.key)));
    if (!preview.value.length) return reportErrorMsg(t("TXT_CODE_scheduleManager.noTargets"));
    retrying.value = false;
    confirming.value = true;
  } finally {
    preparing.value = false;
  }
}
async function retry() {
  if (busy.value || !isAdmin.value) return;
  preparing.value = true;
  try {
    if (!(await refresh())) return;
    preview.value = prepareRetry(rows.value);
    retrying.value = true;
    confirming.value = preview.value.length > 0;
  } finally {
    preparing.value = false;
  }
}
async function executePreview() {
  if (running.value || !isAdmin.value || !confirming.value) return;
  confirming.value = false;
  composer.value?.close();
  await run(preview.value, retrying.value);
  await refresh();
}
async function openEdit(row: ScheduleRow) {
  if (busy.value) return;
  editTarget.value = row;
  await nextTick();
  editor.value?.openDialog(row.task);
}
watch(isAdmin, (value) => {
  if (!value) open.value = false;
});
defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-if="isAdmin"
    v-model:open="open"
    :title="t('TXT_CODE_scheduleManager.title')"
    width="1200px"
    :body-style="{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }"
    :footer="null"
    :closable="!busy"
    :keyboard="!busy"
    :mask-closable="!busy"
    destroy-on-close
  >
    <a-alert
      class="mb-12"
      type="info"
      show-icon
      :message="t('TXT_CODE_scheduleManager.appendHint')"
    />
    <a-alert
      v-if="excludedNodes.length"
      class="mb-12"
      type="warning"
      show-icon
      :message="t('TXT_CODE_scheduleManager.excludedNodes', { nodes: excludedNodes.join(', ') })"
    />
    <a-alert
      v-if="removedSelections"
      class="mb-12"
      type="warning"
      :message="t('TXT_CODE_scheduleManager.removedSelection', { count: removedSelections })"
    />
    <a-tabs v-model:active-key="tab">
      <a-tab-pane key="instances" :tab="t('TXT_CODE_scheduleManager.instances')" />
      <a-tab-pane key="schedules" :tab="t('TXT_CODE_scheduleManager.schedules')" />
    </a-tabs>
    <div class="schedule-toolbar mb-12">
      <a-input
        v-model:value="search"
        allow-clear
        :placeholder="t('TXT_CODE_scheduleManager.search')"
        style="width: 250px"
        :disabled="busy"
      />
      <a-select
        v-model:value="nodeFilter"
        allow-clear
        :placeholder="t('TXT_CODE_scheduleManager.allNodes')"
        style="width: 190px"
        :disabled="busy"
        :options="
          nodes.map((node) => ({ value: node.uuid, label: node.remarks || node.ip || node.uuid }))
        "
      />
      <a-button :loading="loading" :disabled="busy" @click="refresh">
        {{ t("TXT_CODE_scheduleManager.refresh") }}
      </a-button>
      <template v-if="tab === 'instances'">
        <a-button
          type="primary"
          data-testid="batch-add"
          :disabled="busy || !selectedInstances.length"
          @click="composer?.openDialog('selected')"
        >
          {{ t("TXT_CODE_scheduleManager.batchAdd") }}
        </a-button>
        <a-button
          data-testid="apply-all"
          :disabled="busy || !rows.length"
          @click="composer?.openDialog('all')"
        >
          {{ t("TXT_CODE_scheduleManager.applyAll") }}
        </a-button>
      </template>
      <a-button
        v-else
        danger
        data-testid="batch-delete"
        :disabled="busy || !selectedSchedules.length"
        @click="prepareDelete()"
      >
        {{ t("TXT_CODE_scheduleManager.batchDelete", { count: selectedSchedules.length }) }}
      </a-button>
    </div>
    <a-space class="mb-12" wrap>
      <span>{{
        t("TXT_CODE_scheduleManager.selection", {
          count: activeKeys.length,
          hidden: hiddenSelected
        })
      }}</span>
      <a-button type="link" :disabled="busy" @click="selectFiltered">
        {{ t("TXT_CODE_scheduleManager.selectFiltered") }}
      </a-button>
      <a-button type="link" :disabled="busy || !activeKeys.length" @click="clearSelection">
        {{ t("TXT_CODE_scheduleManager.clearSelection") }}
      </a-button>
    </a-space>
    <a-table
      v-if="tab === 'instances'"
      :data-source="filteredInstances"
      :columns="instanceColumns"
      row-key="key"
      :row-selection="instanceSelection"
      :loading="loading"
      :pagination="{ pageSize: 15 }"
      :scroll="{ x: 900 }"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag v-if="!record.nodeAvailable" color="error">
            {{ t("TXT_CODE_scheduleManager.offline") }}
          </a-tag>
          <a-tag v-else>
            {{ INSTANCE_STATUS[record.instanceStatus as keyof typeof INSTANCE_STATUS] }}
          </a-tag>
          <a-tag v-if="record.planError" color="warning">
            {{ t("TXT_CODE_scheduleManager.unreadable") }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'tasks'">
          <span v-if="!record.tasks.length">{{
            record.planError
              ? t("TXT_CODE_scheduleManager.unreadable")
              : t("TXT_CODE_scheduleManager.empty")
          }}</span>
          <a-tag v-for="task in record.tasks" :key="task.name">{{ task.name }}</a-tag>
          <span v-if="!record.planError">{{ record.tasks.length }} / 8</span>
        </template>
        <a-button
          v-else-if="column.key === 'operations'"
          size="small"
          :disabled="busy || record.planError"
          @click="
            selectedInstances = [record.key];
            composer?.openDialog('selected');
          "
        >
          {{ t("TXT_CODE_scheduleManager.add") }}
        </a-button>
      </template>
    </a-table>
    <a-table
      v-else
      :data-source="filteredSchedules"
      :columns="scheduleColumns"
      row-key="key"
      :row-selection="scheduleSelection"
      :loading="loading"
      :pagination="{ pageSize: 15 }"
      :scroll="{ x: 1100 }"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">{{ record.task.name }}</template>
        <template v-else-if="column.key === 'trigger'">
          {{ triggerText(record as ScheduleRow) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          {{ actionText(record as ScheduleRow) }}
        </template>
        <template v-else-if="column.key === 'count'">
          {{
            Number(record.task.count) > 0
              ? record.task.count
              : t("TXT_CODE_scheduleManager.unlimited")
          }}
        </template>
        <a-space v-else-if="column.key === 'operations'">
          <a-button
            size="small"
            type="link"
            :disabled="busy || record.planError"
            @click="openEdit(record as ScheduleRow)"
          >
            {{ t("TXT_CODE_scheduleManager.edit") }}
          </a-button>
          <a-button
            size="small"
            type="link"
            danger
            :disabled="busy || record.planError"
            @click="prepareDelete(record as ScheduleRow)"
          >
            {{ t("TXT_CODE_scheduleManager.delete") }}
          </a-button>
        </a-space>
      </template>
    </a-table>
    <a-divider v-if="results.length" />
    <template v-if="results.length">
      <div class="schedule-toolbar">
        <strong>{{
          t("TXT_CODE_scheduleManager.progress", { done: completed, total: results.length })
        }}</strong>
        <a-tag v-for="status in resultStatuses" :key="status">
          {{ t("TXT_CODE_scheduleManager." + status) }}: {{ resultCounts[status] }}
        </a-tag>
        <a-button :disabled="busy || !retryable.length" :loading="preparing" @click="retry">
          {{ t("TXT_CODE_scheduleManager.retry") }}
        </a-button>
      </div>
      <a-progress
        :percent="results.length ? Math.round((completed * 100) / results.length) : 0"
        :status="running ? 'active' : 'normal'"
      />
      <a-table
        :data-source="results"
        :columns="operationColumns"
        row-key="key"
        :pagination="{ pageSize: 10 }"
        :scroll="{ x: 850 }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'node'">{{ record.target.nodeName }}</template>
          <template v-else-if="column.key === 'instance'">
            {{ record.target.instanceName }}
          </template>
          <template v-else-if="column.key === 'result'">
            {{ t("TXT_CODE_scheduleManager." + record.status) }}
          </template>
          <template v-else-if="column.key === 'detail'">{{ record.detail }}</template>
        </template>
      </a-table>
    </template>
  </a-modal>

  <BulkScheduleComposer
    v-if="isAdmin"
    ref="composer"
    :selected-count="selectedInstances.length"
    :all-count="rows.length"
    :loading="preparing"
    @prepare="prepareCreate"
  />
  <a-modal
    v-if="isAdmin"
    v-model:open="confirming"
    :title="
      t(deleting ? 'TXT_CODE_scheduleManager.confirmDelete' : 'TXT_CODE_scheduleManager.preview')
    "
    width="900px"
    :body-style="{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }"
    :mask-closable="false"
    :ok-button-props="{ danger: deleting }"
    :ok-text="
      deleting
        ? t('TXT_CODE_scheduleManager.batchDelete', { count: preview.length })
        : t('TXT_CODE_scheduleManager.apply')
    "
    @ok="executePreview"
  >
    <a-alert
      class="mb-12"
      :type="deleting ? 'warning' : 'info'"
      show-icon
      :message="
        t(
          deleting
            ? 'TXT_CODE_scheduleManager.deleteSummary'
            : 'TXT_CODE_scheduleManager.createSummary',
          { count: preview.length, instances: previewInstanceCount }
        )
      "
    />
    <a-alert
      v-if="excludedNodes.length"
      class="mb-12"
      type="warning"
      :message="t('TXT_CODE_scheduleManager.excludedNodes', { nodes: excludedNodes.join(', ') })"
    />
    <a-table
      :data-source="preview"
      :columns="operationColumns.filter((column) => column.key !== 'result')"
      row-key="key"
      :pagination="{ pageSize: 10 }"
      :scroll="{ x: 750 }"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'node'">{{ record.target.nodeName }}</template>
        <template v-else-if="column.key === 'instance'">{{ record.target.instanceName }}</template>
        <template v-else-if="column.key === 'detail'">
          {{ preflightDetail(record as ScheduleOperation) }}
        </template>
      </template>
    </a-table>
  </a-modal>
  <NewSchedule
    v-if="isAdmin && editTarget"
    :key="instanceKey(editTarget.daemonId, editTarget.instanceUuid)"
    ref="editor"
    :daemon-id="editTarget.daemonId"
    :instance-id="editTarget.instanceUuid"
    @get-schedule-list="refresh"
  />
</template>

<style scoped>
.schedule-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
