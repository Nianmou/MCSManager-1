<script setup lang="ts">
import { ref } from "vue";
import { notification } from "ant-design-vue";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import {
  newScheduleDraft,
  scheduleToDraft,
  serializeSchedule,
  validScheduleDraft
} from "@/tools/schedule";
import { scheduleCreate, scheduleDelete } from "@/services/apis/instance";
import type { Schedule } from "@/types";
import ScheduleTaskFields from "./ScheduleTaskFields.vue";
const props = defineProps<{ daemonId: string; instanceId: string }>();
const emit = defineEmits(["getScheduleList"]);
const open = ref(false);
const isLoading = ref(false);
const editMode = ref(false);
const newTask = ref(newScheduleDraft());
function openDialog(task?: Schedule) {
  newTask.value = task ? scheduleToDraft(task) : newScheduleDraft();
  editMode.value = !!task;
  open.value = true;
}
async function submit() {
  if (isLoading.value) return;
  try {
    if (!validScheduleDraft(newTask.value))
      throw new Error(t("TXT_CODE_scheduleManager.invalidDraft"));
    const payload = serializeSchedule(newTask.value);
    isLoading.value = true;
    const params = { daemonId: props.daemonId, uuid: props.instanceId };
    if (editMode.value) {
      const result = await scheduleDelete().execute({
        params: { ...params, task_name: payload.name },
        forceRequest: true,
        timeout: 30000
      });
      if (result.value !== true) throw new Error(t("TXT_CODE_scheduleManager.failed"));
    }
    const result = await scheduleCreate().execute({
      params,
      data: payload,
      forceRequest: true,
      timeout: 30000
    });
    if (result.value !== true) throw new Error(t("TXT_CODE_scheduleManager.failed"));
    emit("getScheduleList");
    notification.success({
      message: editMode.value ? t("TXT_CODE_d3de39b4") : t("TXT_CODE_d28c05df")
    });
    open.value = false;
  } catch (err: any) {
    reportErrorMsg(err.message);
  } finally {
    isLoading.value = false;
  }
}
defineExpose({ openDialog });
</script>
<template>
  <a-modal
    v-model:open="open"
    centered
    width="660px"
    :mask-closable="false"
    :title="editMode ? t('TXT_CODE_1548649e') : t('TXT_CODE_3502273d')"
    :confirm-loading="isLoading"
    :destroy-on-close="true"
    :ok-text="t('TXT_CODE_abfe9512')"
    @ok="submit"
  >
    <ScheduleTaskFields v-model="newTask" :edit-mode="editMode" />
  </a-modal>
</template>
