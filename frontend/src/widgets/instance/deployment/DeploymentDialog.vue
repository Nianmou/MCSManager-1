<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
  DeploymentError,
  normalizePackage,
  readPackageFiles,
  type DeploymentMode,
  type DeploymentPackage
} from "./package";
import { createDeploymentTransport } from "./transport";
import {
  DeploymentRunner,
  SHARED_GAME_ROOT,
  instanceKey,
  prepareDeployment,
  eligibleDeploymentTarget,
  refreshUnresolvedDeployments,
  type DeploymentInstance,
  type DeploymentTarget
} from "./workflow";

const { isAdmin } = useAppStateStore();
const transport = createDeploymentTransport();
const open = ref(false);
const mode = ref<DeploymentMode>("platform");
const busy = ref(false);
const running = ref(false);
const scope = ref<"all" | "selected">("all");
const batchConfirmed = ref(false);
const selected = ref<string[]>([]);
const discovery = ref<Awaited<ReturnType<typeof transport.discover>>>({ nodes: [], instances: [] });
const roots = computed(() => Object.fromEntries(
  discovery.value.nodes.map((node) => [node.uuid, SHARED_GAME_ROOT])
));
const pluginName = ref("PreAimMode");
const replaceProtected = ref(false);
const backupBeforeDeploy = ref(true);
const pkg = ref<DeploymentPackage>();
const targets = ref<DeploymentTarget[]>([]);
const error = ref("");
let files: File[] = [];
let folder = false;
let runner: DeploymentRunner | undefined;
const options = computed(() =>
  discovery.value.instances.map((instance) => ({
    value: instanceKey(instance),
    label: `${
      discovery.value.nodes.find((node) => node.uuid === instance.daemonId)?.remarks ||
      instance.daemonId
    } / ${instance.name}`
  }))
);
const eligible = computed(() => targets.value.filter(eligibleDeploymentTarget));
const canRun = computed(() => batchConfirmed.value && eligible.value.length > 0);
const blocked = computed(() =>
  targets.value.filter(
    (target) => target.error || target.running.length || target.phase === "canceled"
  )
);
const successes = computed(
  () => targets.value.filter((target) => target.phase === "success").length
);
const affectedCount = computed(() =>
  targets.value.reduce((count, target) => count + target.affected.length, 0)
);
const inventoryIssues = computed(() =>
  targets.value.length
    ? targets.value
        .filter(
          (target) =>
            target.error instanceof DeploymentError &&
            ["offline", "inventory"].includes(target.error.code)
        )
        .map((target) => target.nodeName)
    : discovery.value.nodes
        .filter((node) => !node.available || discovery.value.issues?.[node.uuid])
        .map((node) => node.remarks || node.ip || node.uuid)
);
function errorText(value: unknown): string {
  if (value instanceof DeploymentError)
    return `${t(`TXT_CODE_deploy.error.${value.code}`)}${value.detail ? `: ${value.detail}` : ""}`;
  return value instanceof Error ? value.message : String(value);
}
function invalidate() {
  targets.value = [];
  pkg.value = undefined;
  error.value = "";
  batchConfirmed.value = false;
}
async function openDialog(
  nextMode: DeploymentMode,
  initial: Pick<DeploymentInstance, "daemonId" | "instanceUuid">[] = []
) {
  if (!isAdmin.value || busy.value || running.value) return;
  mode.value = nextMode;
  scope.value = "all";
  selected.value = initial.map(instanceKey);
  files = [];
  invalidate();
  discovery.value = { nodes: [], instances: [] };
  replaceProtected.value = false;
  backupBeforeDeploy.value = true;
  open.value = true;
  busy.value = true;
  try {
    discovery.value = await transport.discover();
  } catch (err) {
    error.value = errorText(err);
  } finally {
    busy.value = false;
  }
}
function choosePackage(event: Event, isFolder: boolean) {
  files = Array.from((event.target as HTMLInputElement).files || []);
  folder = isFolder;
  invalidate();
}
async function preview() {
  if (!isAdmin.value || busy.value || running.value) return;
  busy.value = true;
  error.value = "";
  targets.value = [];
  batchConfirmed.value = false;
  try {
    const preparedPackage = normalizePackage(
      await readPackageFiles(files, folder),
      mode.value,
      pluginName.value.trim()
    );
    discovery.value = await transport.discover();
    pkg.value = preparedPackage;
    targets.value = await prepareDeployment(
      transport,
      pkg.value,
      scope.value === "all" ? "all" : selected.value,
      roots.value,
      replaceProtected.value,
      discovery.value,
      backupBeforeDeploy.value
    );
  } catch (err) {
    error.value = errorText(err);
  } finally {
    busy.value = false;
  }
}
async function deploy() {
  if (!isAdmin.value || !canRun.value || !pkg.value || running.value) return;
  running.value = true;
  for (const target of eligible.value) target.confirmed = true;
  runner = new DeploymentRunner(transport);
  try {
    await runner.applyBatch(targets.value, pkg.value);
  } finally {
    running.value = false;
    batchConfirmed.value = false;
    runner = undefined;
  }
}
async function retry() {
  if (!isAdmin.value || !pkg.value || busy.value || running.value) return;
  busy.value = true;
  error.value = "";
  batchConfirmed.value = false;
  try {
    targets.value = await refreshUnresolvedDeployments(
      transport,
      pkg.value,
      targets.value,
      replaceProtected.value,
      backupBeforeDeploy.value
    );
  } catch (err) {
    error.value = errorText(err);
  } finally {
    busy.value = false;
  }
}
watch([scope, selected, pluginName, replaceProtected, backupBeforeDeploy], invalidate, {
  deep: true,
  flush: "sync"
});
watch(isAdmin, (admin) => {
  if (!admin) {
    open.value = false;
    void cancel();
  }
});
onBeforeUnmount(() => {
  void cancel();
});
async function cancel() {
  try {
    await runner?.cancel();
  } catch (err) {
    error.value = errorText(err);
  }
}
defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-if="isAdmin"
    v-model:open="open"
    width="1000px"
    :body-style="{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }"
    :title="t(mode === 'platform' ? 'TXT_CODE_deploy.platform' : 'TXT_CODE_deploy.plugin')"
    :mask-closable="false"
    :closable="!running && !busy"
    :keyboard="!running && !busy"
    :footer="null"
  >
    <a-space direction="vertical" style="width: 100%" :size="16">
      <a-alert
        type="info"
        show-icon
        :message="t('TXT_CODE_deploy.activation')"
        :description="t('TXT_CODE_deploy.maintenance')"
      />
      <a-alert v-if="error" type="error" show-icon :message="error" />
      <a-alert type="info" show-icon :message="t('TXT_CODE_deploy.allHint')" />
      <a-alert
        v-if="inventoryIssues.length"
        type="warning"
        show-icon
        :message="
          t('TXT_CODE_deploy.coverageWarning', {
            nodes: inventoryIssues.join(', ')
          })
        "
      />
      <fieldset
        :disabled="busy || running || targets.some((target) => target.phase === 'success')"
        style="border: 0; padding: 0"
      >
        <a-form
          layout="vertical"
          :disabled="busy || running || targets.some((target) => target.phase === 'success')"
        >
          <a-form-item :label="t('TXT_CODE_deploy.scope')">
            <a-radio-group v-model:value="scope" data-testid="deployment-scope">
              <a-radio-button value="all">
                {{
                  t("TXT_CODE_deploy.allScope", { count: discovery.instances.length })
                }}
              </a-radio-button>
              <a-radio-button value="selected">
                {{
                  t("TXT_CODE_deploy.selectedScope", { count: selected.length })
                }}
              </a-radio-button>
            </a-radio-group>
          </a-form-item>
          <a-form-item v-if="scope === 'selected'" :label="t('TXT_CODE_deploy.targets')">
            <a-select
              v-model:value="selected"
              mode="multiple"
              :options="options"
              :loading="busy"
              option-filter-prop="label"
              @change="invalidate"
            />
          </a-form-item>
          <a-form-item v-if="mode === 'plugin'" :label="t('TXT_CODE_deploy.pluginName')">
            <a-input v-model:value="pluginName" @change="invalidate" />
          </a-form-item>
          <a-form-item :label="t('TXT_CODE_deploy.package')">
            <a-space wrap>
              <label>{{ t("TXT_CODE_deploy.zip") }}
                <input type="file" accept=".zip" @change="choosePackage($event, false)" /></label>
              <label>{{ t("TXT_CODE_deploy.folder") }}
                <input type="file" webkitdirectory multiple @change="choosePackage($event, true)" /></label>
            </a-space>
          </a-form-item>
          <a-form-item :label="t('TXT_CODE_deploy.directory')">
            <code data-testid="deployment-shared-root">{{ SHARED_GAME_ROOT }}</code>
          </a-form-item>
          <a-checkbox v-model:checked="replaceProtected" @change="invalidate">
            {{ t("TXT_CODE_deploy.replaceProtected") }}
          </a-checkbox>
          <div class="mt-16">
            <a-checkbox v-model:checked="backupBeforeDeploy" data-testid="deployment-backup">
              {{ t("TXT_CODE_deploy.backupBeforeDeploy") }}
            </a-checkbox>
          </div>
          <a-alert
            v-if="!backupBeforeDeploy" class="mt-16" type="warning" show-icon
            :message="t('TXT_CODE_deploy.noBackupWarning')"
          />
          <div style="margin-top: 16px">
            <a-button data-testid="deployment-preview" :loading="busy" @click="preview">
              {{
                t("TXT_CODE_deploy.preview")
              }}
            </a-button>
          </div>
        </a-form>
      </fieldset>
      <a-alert
        v-if="targets.length"
        show-icon
        :type="blocked.length ? 'warning' : 'info'"
        data-testid="deployment-summary"
        :message="
          t('TXT_CODE_deploy.batchSummary', {
            instances: affectedCount,
            destinations: targets.length,
            eligible: eligible.length,
            blocked: blocked.length,
            success: successes
          })
        "
      />
      <template v-if="pkg">
        <p>
          {{
            t("TXT_CODE_deploy.manifest", {
              count: pkg.entries.length,
              size: (pkg.bytes / 1048576).toFixed(2)
            })
          }}
        </p>
        <details>
          <summary>{{ t("TXT_CODE_deploy.files") }}</summary>
          <div style="max-height: 240px; overflow: auto">
            <div v-for="entry in pkg.entries" :key="entry.path" style="overflow-wrap: anywhere">
              <code>{{ entry.path }}</code> ({{ entry.bytes.length }} B)
              <a-tag v-if="entry.protected">{{ t("TXT_CODE_deploy.protected") }}</a-tag>
            </div>
          </div>
        </details>
      </template>
      <a-card v-for="target in targets" :key="target.key" size="small" :title="target.nodeName">
        <a-space direction="vertical" style="width: 100%">
          <code style="overflow-wrap: anywhere">{{ target.root }}</code>
          <a-tag
            :color="
              target.phase === 'success'
                ? 'success'
                : target.phase === 'failed'
                  ? 'error'
                  : 'processing'
            "
          >
            {{ t(`TXT_CODE_deploy.phase.${target.phase}`) }}
          </a-tag>
          <a-alert v-if="target.error" type="error" :message="errorText(target.error)" />
          <a-alert
            v-if="target.running.length"
            type="warning"
            :message="t('TXT_CODE_deploy.running', { names: target.running.join(', ') })"
          />
          <p>
            {{ t("TXT_CODE_deploy.affected") }}:
            {{ target.affected.map((instance) => instance.name).join(", ") }}
          </p>
          <details>
            <summary>{{ t("TXT_CODE_deploy.replacements") }}</summary>
            <div style="max-height: 200px; overflow: auto">
              <div v-for="file in target.files" :key="file.entry.path">
                {{
                  t(
                    !file.write
                      ? "TXT_CODE_deploy.preserve"
                      : file.existing
                        ? "TXT_CODE_deploy.replace"
                        : "TXT_CODE_deploy.new"
                  )
                }}
                — {{ file.entry.path }}
              </div>
            </div>
          </details>
          <p v-if="target.loaderPatched !== undefined">{{ t("TXT_CODE_deploy.loader") }}</p>
          <p v-if="target.backup" style="overflow-wrap: anywhere">
            {{ t("TXT_CODE_deploy.backup") }}: <code>{{ target.backup }}</code>
          </p>
          <a-tag v-if="target.backupBeforeDeploy === false" color="orange">
            {{ t("TXT_CODE_deploy.noBackup") }}
          </a-tag>
          <a-alert
            v-if="target.phase === 'failed' || target.phase === 'canceled'"
            type="warning"
            :message="t('TXT_CODE_deploy.recovery')"
          />
        </a-space>
      </a-card>
      <a-checkbox
        v-if="targets.length"
        v-model:checked="batchConfirmed"
        data-testid="deployment-confirm"
        :disabled="running || busy || !eligible.length"
      >
        {{ t("TXT_CODE_deploy.confirmBatch", { count: eligible.length }) }}
      </a-checkbox>
      <a-space wrap>
        <a-button
          data-testid="deployment-apply"
          type="primary"
          :disabled="!canRun || busy || running"
          @click="deploy"
        >
          {{ t("TXT_CODE_deploy.apply") }}
        </a-button>
        <a-button
          v-if="!running && blocked.length"
          data-testid="deployment-retry"
          :loading="busy"
          @click="retry"
        >
          {{ t("TXT_CODE_deploy.retry") }}
        </a-button>
        <a-button v-if="running" danger @click="cancel">{{ t("TXT_CODE_deploy.cancel") }}</a-button>
      </a-space>
    </a-space>
  </a-modal>
</template>
