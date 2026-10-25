<script setup lang="ts">
import { computed, ref } from "vue";
import { t } from "@/lang/i18n";
import { useRestartNotice, noticePending, validNoticeDraft } from "@/hooks/useRestartNotice";
import type { RestartNoticeTarget } from "@/services/apis/restartNotice";

const visible = ref(false);
const tab = ref("create");
const targets = ref<RestartNoticeTarget[]>([]);
const seconds = ref(15);
const text = ref("");
const { jobs, job, loading, saving, error, now, failed, cancelable, open, close, select, submit, cancel } = useRestartNotice();
const valid = computed(() => validNoticeDraft(targets.value, seconds.value, text.value));
const columns = computed(() => [
  { title: t("TXT_CODE_restartNotice.target"), key: "target" },
  { title: t("TXT_CODE_restartNotice.progress"), key: "progress" },
  { title: t("TXT_CODE_restartNotice.details"), key: "details" },
  { title: t("TXT_CODE_restartNotice.actions"), key: "actions" }
]);
function openDialog(selected: RestartNoticeTarget[] = []) {
  targets.value = selected.map((target) => ({ ...target }));
  seconds.value = 15;
  text.value = t("TXT_CODE_restartNotice.defaultMessage");
  tab.value = selected.length ? "create" : "history";
  visible.value = true;
  void open();
}
async function confirm() { if (await submit(targets.value, seconds.value, text.value)) tab.value = "history"; }
function retry() {
  if (!job.value) return;
  targets.value = failed.value.map((target) => ({ daemonId: target.daemonId, instanceUuid: target.instanceUuid, name: target.name }));
  seconds.value = job.value.seconds;
  text.value = job.value.message;
  tab.value = "create";
}
function dismiss() { visible.value = false; close(); }
defineExpose({ openDialog });
</script>

<template>
  <a-modal :open="visible" :title="t('TXT_CODE_restartNotice.title')" :width="980" :footer="null" @cancel="dismiss">
    <a-alert class="mb-16" type="info" show-icon :message="t('TXT_CODE_restartNotice.explanation')" />
    <a-alert v-if="error" class="mb-16" type="error" show-icon :message="error" />
    <a-tabs v-model:active-key="tab">
      <a-tab-pane key="create" :tab="t('TXT_CODE_restartNotice.create')">
        <a-alert v-if="!targets.length" type="warning" :message="t('TXT_CODE_restartNotice.selectFirst')" />
        <p>{{ t('TXT_CODE_restartNotice.targetCount', { count: targets.length }) }}</p>
        <ul class="notice-targets">
          <li v-for="target in targets" :key="`${target.daemonId}:${target.instanceUuid}`">
            <strong>{{ target.name || target.instanceUuid }}</strong>
            <small>{{ target.daemonId }} / {{ target.instanceUuid }}</small>
          </li>
        </ul>
        <a-form layout="vertical">
          <a-form-item :label="t('TXT_CODE_restartNotice.seconds')">
            <a-input-number v-model:value="seconds" :min="10" :max="3600" :precision="0" :disabled="saving" />
          </a-form-item>
          <a-form-item :label="t('TXT_CODE_restartNotice.message')">
            <a-input v-model:value="text" :maxlength="200" show-count :disabled="saving" />
          </a-form-item>
        </a-form>
        <a-button type="primary" danger :disabled="!valid" :loading="saving" data-testid="confirm-notice" @click="confirm">
          {{ t('TXT_CODE_restartNotice.confirm') }}
        </a-button>
      </a-tab-pane>
      <a-tab-pane key="history" :tab="t('TXT_CODE_restartNotice.history')">
        <a-spin :spinning="loading">
          <a-select :value="job?.id" style="width: 100%" :placeholder="t('TXT_CODE_restartNotice.history')" @change="(id) => select(String(id))">
            <a-select-option v-for="item in jobs" :key="item.id" :value="item.id">
              {{ new Date(item.createdAt).toLocaleString() }} · {{ t('TXT_CODE_restartNotice.targetCount', { count: item.targets.length }) }} · {{ item.id.slice(0, 8) }}
            </a-select-option>
          </a-select>
          <template v-if="job">
            <p class="mt-16">{{ job.message }} · {{ t('TXT_CODE_restartNotice.duration', { seconds: job.seconds }) }}</p>
            <a-space class="mb-16" wrap>
              <a-button :disabled="!cancelable || saving" data-testid="cancel-notice" @click="cancel()">{{ t('TXT_CODE_restartNotice.cancelPending') }}</a-button>
              <a-button :disabled="!failed.length || saving" data-testid="retry-notice" @click="retry">{{ t('TXT_CODE_restartNotice.retry') }}</a-button>
              <a-button :disabled="saving" @click="open()">{{ t('TXT_CODE_restartNotice.refresh') }}</a-button>
            </a-space>
            <a-table :columns="columns" :data-source="job.targets" row-key="taskId" :pagination="false" :scroll="{ x: 700, y: 360 }" size="small">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'target'">
                  <div>{{ record.name || record.instanceUuid }}</div>
                  <small>{{ record.daemonId }} / {{ record.instanceUuid }}</small>
                </template>
                <template v-else-if="column.key === 'progress'">
                  <a-tag :color="record.state === 'completed' ? 'green' : record.state === 'countdown' ? 'gold' : 'default'">{{ t(`TXT_CODE_restartNotice.state_${record.state}`) }}</a-tag>
                  <span v-if="record.state === 'countdown'">{{ Math.max(0, Math.ceil(((record.deadline || now) - now) / 1000)) }}s</span>
                </template>
                <template v-else-if="column.key === 'details'">{{ record.reason ? t(`TXT_CODE_restartNotice.reason_${record.reason}`) : '' }}</template>
                <template v-else-if="column.key === 'actions'">
                  <a-button v-if="noticePending(record.state)" size="small" :disabled="saving" @click="cancel([record.taskId])">{{ t('TXT_CODE_restartNotice.cancel') }}</a-button>
                </template>
              </template>
            </a-table>
          </template>
          <a-empty v-else class="mt-16" :description="t('TXT_CODE_restartNotice.empty')" />
        </a-spin>
      </a-tab-pane>
    </a-tabs>
  </a-modal>
</template>

<style scoped>
.notice-targets { max-height: 180px; overflow: auto; padding-left: 20px; }
small { display: block; opacity: 0.65; overflow-wrap: anywhere; }
</style>
