<script setup lang="ts">
import { computed, h } from "vue";
import dayjs from "dayjs";
import { t } from "@/lang/i18n";
import type { ScheduleAction, ScheduleTaskForm } from "@/types";
import {
  ScheduleActionType,
  ScheduleActionTypeEnum,
  ScheduleCreateType,
  ScheduleType
} from "@/types/const";
import { MinusCircleOutlined, PlusCircleOutlined } from "@ant-design/icons-vue";
import { Flex } from "ant-design-vue";
import { newRestartNoticePayload, restartNoticeFields } from "@/tools/schedule";
const props = defineProps<{ modelValue: ScheduleTaskForm; editMode?: boolean }>();
const emit = defineEmits<{ (event: "update:modelValue", value: ScheduleTaskForm): void }>();
const newTask = computed(() => props.modelValue);
const update = (patch: Partial<ScheduleTaskForm>) =>
  emit("update:modelValue", { ...props.modelValue, ...patch });
const updateCycle = (index: number, value: string) => {
  const cycle = [...newTask.value.cycle];
  cycle[index] = value;
  update({ cycle });
};
const updateAction = (index: number, patch: Partial<ScheduleAction>) =>
  update({
    actions: newTask.value.actions.map((action, i) =>
      i === index ? { ...action, ...patch } : { ...action }
    )
  });
const addEmptyAction = () =>
  update({ actions: [...newTask.value.actions, { type: "command", payload: "" }] });
const delAction = (index: number) =>
  update({ actions: newTask.value.actions.filter((_, i) => i !== index) });
const actionTypes = (action: ScheduleAction) => Object.fromEntries(Object.entries(ScheduleActionType)
  .filter(([key]) => key !== "restart" || action.type === "restart"));
const selectAction = (index: number, type: string) => updateAction(index, {
  type, payload: type === "restart_notice" ? newRestartNoticePayload() : ""
});
const updateNotice = (index: number, patch: object) => updateAction(index, {
  payload: JSON.stringify({ ...restartNoticeFields(newTask.value.actions[index].payload), ...patch })
});
const getInputPlaceholder = (action: ScheduleAction) =>
  action.type === ScheduleActionTypeEnum.Delay
    ? t("TXT_CODE_bb760145")
    : action.type === ScheduleActionTypeEnum.Command
    ? t("TXT_CODE_8ff89011")
    : undefined;
const weeks = [
  "TXT_CODE_fcbdcb34",
  "TXT_CODE_c73de59d",
  "TXT_CODE_85617390",
  "TXT_CODE_c9b31f8e",
  "TXT_CODE_d4517dcb",
  "TXT_CODE_d248b5c8",
  "TXT_CODE_a621f370"
].map((key, index) => ({ label: t(key), value: index + 1 }));
</script>
<template>
  <a-form-item>
    <a-typography-title :level="5">{{ t("TXT_CODE_b290a4b0") }}</a-typography-title>
    <a-typography-paragraph>
      <a-typography-text type="secondary">
        {{ t("TXT_CODE_b72d638d") }}
      </a-typography-text>
    </a-typography-paragraph>
    <a-input :value="newTask.name" :disabled="editMode" @update:value="update({ name: $event })" />
  </a-form-item>

  <a-form-item>
    <a-typography-title :level="5">{{ t("TXT_CODE_a62c99d1") }}</a-typography-title>
    <a-select
      :value="newTask.type"
      :placeholder="t('TXT_CODE_3bb646e4')"
      :dropdown-match-select-width="false"
      @update:value="update({ type: Number($event) })"
    >
      <a-select-option v-for="(type, i) in ScheduleType" :key="i" :value="Number(i)">
        {{ type }}
      </a-select-option>
    </a-select>
  </a-form-item>

  <template v-if="newTask.type === ScheduleCreateType.INTERVAL">
    <a-form-item>
      <a-typography-paragraph>
        <a-typography-title :level="5">{{ t("TXT_CODE_3554dac0") }}</a-typography-title>
        <a-typography-text>
          {{ t("TXT_CODE_f17889f4") }}
        </a-typography-text>
      </a-typography-paragraph>
      <a-row :gutter="[24, 24]">
        <a-col :xs="24" :md="8" :offset="0">
          <a-input
            :value="newTask.cycle[2]"
            :placeholder="t('TXT_CODE_ba8ebc7')"
            :addon-after="t('TXT_CODE_4e2c7f64')"
            @update:value="updateCycle(2, $event)"
          />
        </a-col>
        <a-col :xs="24" :md="8" :offset="0">
          <a-input
            :value="newTask.cycle[1]"
            :placeholder="t('TXT_CODE_ba8ebc7')"
            :addon-after="t('TXT_CODE_a7e9ff0f')"
            @update:value="updateCycle(1, $event)"
          />
        </a-col>
        <a-col :xs="24" :md="8" :offset="0">
          <a-input
            :value="newTask.cycle[0]"
            :placeholder="t('TXT_CODE_ba8ebc7')"
            :addon-after="t('TXT_CODE_acabc771')"
            @update:value="updateCycle(0, $event)"
          />
        </a-col>
      </a-row>
    </a-form-item>
    <a-form-item>
      <a-typography-title :level="5">{{ t("TXT_CODE_d9cfab1b") }}</a-typography-title>
      <a-input-number
        :value="newTask.count"
        size="large"
        class="w-100"
        :placeholder="t('TXT_CODE_a59981f4')"
        @update:value="update({ count: $event })"
      />
    </a-form-item>
  </template>

  <template v-if="newTask.type === ScheduleCreateType.CYCLE">
    <a-form-item>
      <a-typography-title :level="5">{{ t("TXT_CODE_3554dac0") }}</a-typography-title>
      <a-time-picker
        :value="newTask.objTime"
        size="large"
        :placeholder="t('TXT_CODE_38591f72')"
        class="w-100"
        @update:value="update({ objTime: dayjs($event) })"
      />
    </a-form-item>
    <a-form-item>
      <a-checkbox-group
        :value="newTask.weekend"
        :options="weeks"
        @update:value="update({ weekend: $event.map(Number) })"
      />
    </a-form-item>

    <a-form-item>
      <a-typography-title :level="5">{{ t("TXT_CODE_d9cfab1b") }}</a-typography-title>
      <a-input-number
        :value="newTask.count"
        size="large"
        class="w-100"
        :placeholder="t('TXT_CODE_a59981f4')"
        @update:value="update({ count: $event })"
      />
    </a-form-item>
  </template>

  <a-form-item v-if="newTask.type === ScheduleCreateType.SPECIFY">
    <a-typography-title :level="5">{{ t("TXT_CODE_f3fe5c8e") }}</a-typography-title>
    <a-date-picker
      :value="newTask.objTime"
      show-time
      size="large"
      class="w-100"
      @update:value="update({ objTime: dayjs($event) })"
    />
  </a-form-item>

  <a-form-item>
    <div class="flex justify-between items-center mb-20">
      <div>
        <a-typography-title :level="5" :style="{ marginBottom: 0 }">
          {{ t("TXT_CODE_61811ac") }}
        </a-typography-title>
        <a-typography-paragraph>
          <a-typography-text type="secondary">
            {{ t("TXT_CODE_81297804") }}
          </a-typography-text>
        </a-typography-paragraph>
      </div>
      <a-button
        :disabled="newTask.actions.length >= 10"
        :icon="h(PlusCircleOutlined)"
        @click="addEmptyAction()"
      >
        {{ t("TXT_CODE_dfc17a0c") }}
      </a-button>
    </div>
    <template v-for="(action, index) in newTask.actions" :key="index">
      <a-form-item>
        <a-row :gutter="[12, 24]">
          <a-col :xs="24" :md="6" :offset="0">
            <a-select
              :value="action.type"
              :placeholder="t('TXT_CODE_3bb646e4')"
              :dropdown-match-select-width="false"
              @update:value="selectAction(index, String($event))"
            >
              <a-select-option v-for="(type, i) in actionTypes(action)" :key="i" :value="i">
                {{ type }}
              </a-select-option>
            </a-select>
          </a-col>
          <a-col :xs="24" :md="16" :offset="0">
            <a-space v-if="action.type === 'restart_notice'" direction="vertical" class="w-100">
              <a-input-number
                :value="restartNoticeFields(action.payload)?.seconds" :min="10" :max="3600"
                :addon-after="t('TXT_CODE_restartNotice.seconds')" data-testid="schedule-notice-seconds"
                @update:value="updateNotice(index, { seconds: $event })"
              />
              <a-input
                :value="restartNoticeFields(action.payload)?.message" :maxlength="200"
                :placeholder="t('TXT_CODE_restartNotice.message')" data-testid="schedule-notice-message"
                @update:value="updateNotice(index, { message: $event })"
              />
              <a-typography-text type="secondary">{{ t("TXT_CODE_scheduleNotice.requiresRcon") }}</a-typography-text>
            </a-space>
            <Flex v-else>
              <a-input
                :value="action.payload"
                :placeholder="getInputPlaceholder(action)"
                :disabled="!getInputPlaceholder(action)"
                @update:value="updateAction(index, { payload: $event })"
              />
            </Flex>
          </a-col>
          <a-col :xs="24" :md="2" :offset="0">
            <div>
              <a-button
                :disabled="newTask.actions.length <= 1"
                :icon="h(MinusCircleOutlined)"
                danger
                @click="delAction(index)"
              ></a-button>
            </div>
          </a-col>
        </a-row>
      </a-form-item>
    </template>
  </a-form-item>
</template>
