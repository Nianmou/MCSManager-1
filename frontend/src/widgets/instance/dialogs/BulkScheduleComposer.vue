<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import {
  newScheduleDraft,
  serializeSchedule,
  validScheduleDraft,
  type SchedulePayload
} from "@/tools/schedule";
import ScheduleTaskFields from "./ScheduleTaskFields.vue";
import cloneDeep from "lodash/cloneDeep";

defineProps<{ selectedCount: number; allCount: number; loading: boolean }>();
const emit = defineEmits<{
  (event: "prepare", scope: "selected" | "all", drafts: SchedulePayload[]): void;
}>();
const open = ref(false);
const scope = ref<"selected" | "all">("selected");
let nextId = 0;
const drafts = ref([{ id: nextId++, value: newScheduleDraft() }]);
function openDialog(initialScope: "selected" | "all") {
  scope.value = initialScope;
  drafts.value = [{ id: nextId++, value: newScheduleDraft() }];
  open.value = true;
}
function prepare() {
  const values = drafts.value.map((d) => d.value);
  if (!values.length || values.length > 8 || values.some((d) => !validScheduleDraft(d))) {
    return reportErrorMsg(t("TXT_CODE_scheduleManager.invalidDraft"));
  }
  if (new Set(values.map((d) => d.name)).size !== values.length)
    return reportErrorMsg(t("TXT_CODE_scheduleManager.duplicateDraft"));
  emit("prepare", scope.value, values.map(serializeSchedule));
}
defineExpose({
  openDialog,
  close: () => {
    open.value = false;
  }
});
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('TXT_CODE_scheduleManager.batchAdd')"
    width="760px"
    :body-style="{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }"
    :mask-closable="false"
    :closable="!loading"
    :keyboard="!loading"
    :cancel-button-props="{ disabled: loading }"
    :confirm-loading="loading"
    :ok-text="t('TXT_CODE_scheduleManager.preview')"
    @ok="prepare"
  >
    <a-alert
      class="mb-20"
      type="info"
      show-icon
      :message="t('TXT_CODE_scheduleManager.appendHint')"
    />
    <a-radio-group v-model:value="scope" class="mb-20" :disabled="loading">
      <a-radio-button value="selected">
        {{ t("TXT_CODE_scheduleManager.selectedScope", { count: selectedCount }) }}
      </a-radio-button>
      <a-radio-button value="all">
        {{ t("TXT_CODE_scheduleManager.allScope", { count: allCount }) }}
      </a-radio-button>
    </a-radio-group>
    <div v-for="(draft, index) in drafts" :key="draft.id" class="draft-card">
      <div class="draft-heading">
        <strong>{{ t("TXT_CODE_scheduleManager.draftNumber", { count: index + 1 }) }}</strong>
        <a-space>
          <a-button
            size="small"
            :disabled="loading || drafts.length >= 8"
            @click="drafts.push({ id: nextId++, value: cloneDeep(draft.value) })"
          >
            {{ t("TXT_CODE_scheduleManager.duplicate") }}
          </a-button>
          <a-button
            size="small"
            danger
            :disabled="loading || drafts.length === 1"
            @click="drafts.splice(index, 1)"
          >
            {{ t("TXT_CODE_scheduleManager.removeDraft") }}
          </a-button>
        </a-space>
      </div>
      <fieldset :disabled="loading" class="draft-fields">
        <ScheduleTaskFields v-model="draft.value" />
      </fieldset>
    </div>
    <a-button
      block
      :disabled="loading || drafts.length >= 8"
      @click="drafts.push({ id: nextId++, value: newScheduleDraft() })"
    >
      {{ t("TXT_CODE_scheduleManager.addDraft") }}
    </a-button>
  </a-modal>
</template>

<style scoped>
.draft-card {
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.draft-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.draft-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
</style>
