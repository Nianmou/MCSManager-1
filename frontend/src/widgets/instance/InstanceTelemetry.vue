<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { instanceTelemetry } from "@/tools/instanceTelemetry";
import { UserOutlined } from "@ant-design/icons-vue";
const props = defineProps<{ instance?: InstanceDetail; field: "players" | "versions" }>();
const telemetry = computed(() => instanceTelemetry(props.instance));
const missingRcon = computed(() => {
  const config = props.instance?.config;
  return props.instance?.status === 3 && config && !config.type?.includes("minecraft") &&
    (!config.enableRcon || !config.rconPassword || typeof config.rconPort !== "number" || !Number.isInteger(config.rconPort) ||
      config.rconPort < 1 || config.rconPort > 65535);
});
const unavailableLabel = computed(() => t(missingRcon.value
  ? "TXT_CODE_cs2.rconNotConfigured" : "TXT_CODE_cs2.unknown"));
const unavailableHint = computed(() => missingRcon.value &&
  (props.field === "players" ? telemetry.value.players === undefined :
    telemetry.value.pluginVersion === undefined || telemetry.value.platformVersion === undefined)
  ? t("TXT_CODE_cs2.rconNotConfiguredHint") : undefined);
</script>
<template>
  <a-tooltip :title="unavailableHint">
    <span v-if="field === 'players'" data-testid="instance-player-count">
      <UserOutlined /> {{ telemetry.players ?? unavailableLabel }}
    </span>
    <a-space v-else direction="vertical" :size="0" data-testid="instance-versions">
      <span>{{ t("TXT_CODE_cs2.pluginVersion") }}: {{ telemetry.pluginVersion ?? unavailableLabel }}</span>
      <span>{{ t("TXT_CODE_cs2.platformVersion") }}: {{ telemetry.platformVersion ?? unavailableLabel }}</span>
      <span>{{ t("TXT_CODE_cs2.addonsManagerVersion") }}: {{ telemetry.addonsManager === 'loaded'
        ? telemetry.addonsManagerVersion : t(telemetry.addonsManager === 'not_loaded'
          ? 'TXT_CODE_cs2.notLoaded' : 'TXT_CODE_cs2.unknown') }}</span>
    </a-space>
  </a-tooltip>
</template>
