<script setup lang="ts">
import { ALL_DAEMON_MODE } from "@/config/const";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types/index";
import {
  AppstoreOutlined,
  CloudDownloadOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownOutlined,
  FieldTimeOutlined,
  FormOutlined,
  FrownOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  SearchOutlined,
  UploadOutlined,
  WarningOutlined
} from "@ant-design/icons-vue";
import { computed, h, onMounted, onUnmounted, ref } from "vue";

import BetweenMenus from "@/components/BetweenMenus.vue";
import { router } from "@/config/router";
import { useInstanceTagSearch, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { useScreen } from "@/hooks/useScreen";
import { remoteInstances, remoteInstancesGlobal, remoteNodeList } from "@/services/apis";
import { realFileList, uploadAddress as getFileUploadAddress } from "@/services/apis/fileManager";
import {
  batchDelete,
  batchKill,
  batchRestart,
  batchStart,
  batchStop,
  getInstanceInfo,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import uploadService from "@/services/uploadService";
import { compressFolder, type ScanItem } from "@/tools/folderUploader";
import { parseForwardAddress } from "@/tools/protocol";
import { reportErrorMsg } from "@/tools/validator";
import type { AntColumnsType } from "@/types/ant";
import { INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@/types/const";
import { message, Modal, notification } from "ant-design-vue";
import { throttle } from "lodash";
import { getFileConfigAddr } from "../hooks/useFileManager";
import type { InstanceMoreDetail } from "../hooks/useInstance";
import { useInstanceMoreDetail } from "../hooks/useInstance";
import { computeNodeName } from "../tools/nodes";
import type { InstanceDetail, NodeStatus } from "../types/index";
import InstanceLine from "./instance/InstanceLine.vue";
import Shortcut from "./instance/Shortcut.vue";
import ScheduleManager from "./instance/dialogs/ScheduleManager.vue";

defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const operationForm = ref({
  instanceName: "",
  currentPage: 1,
  pageSize: 20,
  status: ""
});

const currentRemoteNode = ref<NodeStatus>();
const isGlobalDaemonMode = computed(() => currentRemoteNode.value?.uuid === ALL_DAEMON_MODE);

const scheduleManagerDialog = ref<InstanceType<typeof ScheduleManager>>();

const { execute: getNodes, state: nodes, isLoading: loadingNodes } = remoteNodeList();
const { execute: getInstances, state: instances, isLoading: loadingInstance } = remoteInstances();
const isGlobalLoading = ref(true);
const { updateTagTips, tagTips } = useInstanceTagTips();
const {
  tags: selectedTags,
  setRefreshFn,
  selectTag,
  removeTag,
  isTagSelected,
  clearTags
} = useInstanceTagSearch();

const isLoading = computed(
  () => loadingNodes.value || loadingInstance.value || isGlobalLoading.value
);

const instancesMoreInfo = computed(() => {
  const newInstances: InstanceMoreDetail[] = [];
  for (const instance of instances.value?.data || []) {
    const instanceMoreInfo = useInstanceMoreDetail(instance);
    newInstances.push(instanceMoreInfo);
  }
  return newInstances || [];
});

const initNodes = async () => {
  await getNodes();
  nodes?.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  if (nodes.value?.length === 0) {
    return reportErrorMsg(t("TXT_CODE_e3d96a26"));
  }
  if (localStorage.getItem("pageSelectedRemote")) {
    currentRemoteNode.value = JSON.parse(localStorage.pageSelectedRemote);
    if (isGlobalDaemonMode.value) return;
    if (!nodes.value?.some((item) => item.uuid === currentRemoteNode.value?.uuid)) {
      currentRemoteNode.value = undefined;
    }
  } else {
    currentRemoteNode.value = nodes.value?.[0];
  }
};

const tableTreeData = ref<any[]>([]);

const initInstancesData = async (resetPage?: boolean, daemonId?: string, instanceId?: string) => {
  try {
    selectedInstance.value = [];
    if (resetPage) operationForm.value.currentPage = 1;
    if (!currentRemoteNode.value) await initNodes();

    if (!isGlobalDaemonMode.value) {
      await getInstances({
        params: {
          page: operationForm.value.currentPage,
          page_size: operationForm.value.pageSize,
          status: operationForm.value.status,
          instance_name: operationForm.value.instanceName.trim(),
          tag: JSON.stringify(selectedTags.value),
          daemonId: currentRemoteNode.value?.uuid ?? ""
        }
      });
      updateTagTips(instances.value?.allTags || []);
      return;
    }

    updateTagTips([]);
    isGlobalLoading.value = true;
    if (daemonId && instanceId) {
      const { execute: getInfo, state: info } = getInstanceInfo();
      await getInfo({ params: { uuid: instanceId, daemonId } });
      if (!info.value) return;

      const targetNodeIndex = tableTreeData.value.findIndex((n) => n.key === daemonId);
      if (targetNodeIndex === -1) return;

      const targetChildIndex = tableTreeData.value[targetNodeIndex].children.findIndex(
        (c: any) => c.key === instanceId
      );
      if (targetChildIndex === -1) return;

      const d = useInstanceMoreDetail(info.value);
      tableTreeData.value[targetNodeIndex].children[targetChildIndex].inst = d;
      tableTreeData.value[targetNodeIndex].children[targetChildIndex].name =
        d.config?.nickname || d.instanceUuid;
      return;
    }

    const { execute: getGlobalInstances, state: globalInstances } = remoteInstancesGlobal();
    await getGlobalInstances({
      params: {
        page: 1,
        page_size: 10,
        status: operationForm.value.status,
        instance_name: operationForm.value.instanceName.trim()
      }
    });

    if (globalInstances.value) {
      const newTreeData = [];

      if (!nodes.value) return;
      for (const node of nodes.value) {
        const nodesDataMap = globalInstances.value;
        const item = nodesDataMap[node.uuid];

        let children: any[] = [];
        let nodeMaxPage = 1;
        let nodeCurrentPage = 1;
        if (item) {
          nodeMaxPage = item.maxPage || 1;
          nodeCurrentPage = item.page || 1;
          if (!item.instances) continue;

          children = item.instances.map((inst) => {
            const d = useInstanceMoreDetail(inst);
            return {
              daemonId: node.uuid,
              key: d.instanceUuid,
              name: d.config?.nickname || d.instanceUuid,
              inst: d
            };
          });

          if (nodeCurrentPage < nodeMaxPage) {
            children.push({
              isLoadMore: true,
              daemonId: node.uuid,
              key: `${node.uuid}-load-more`
            });
          }
        }

        newTreeData.push({
          key: node.uuid,
          name: computeNodeName(node.ip, node.available, node.remarks),
          node: node,
          maxPage: nodeMaxPage,
          nodeCurrentPage: nodeCurrentPage,
          children
        });
      }

      tableTreeData.value = newTreeData;
    }
  } catch (err) {
    return reportErrorMsg(t("TXT_CODE_e109c091"));
  } finally {
    isGlobalLoading.value = false;
  }
};

const loadMoreInstances = async (daemonId: string) => {
  const targetNodeIndex = tableTreeData.value.findIndex((n) => n.key === daemonId);
  if (targetNodeIndex === -1) return;
  const nodeData = tableTreeData.value[targetNodeIndex];

  const nextPage = (nodeData.nodeCurrentPage || 1) + 1;
  const { execute: getInstances, state: instances } = remoteInstances();
  await getInstances({
    params: {
      page: nextPage,
      page_size: 10,
      status: operationForm.value.status,
      instance_name: operationForm.value.instanceName.trim(),
      tag: JSON.stringify(selectedTags.value),
      daemonId: daemonId
    }
  });

  if (!instances.value) return;
  const newChildren = instances.value.data.map((inst) => {
    const d = useInstanceMoreDetail(inst);
    return {
      daemonId: daemonId,
      key: d.instanceUuid,
      name: d.config?.nickname || d.instanceUuid,
      inst: d
    };
  });

  nodeData.children = nodeData.children.filter((c: any) => !c.isLoadMore);
  nodeData.children.push(...newChildren);

  nodeData.nodeCurrentPage = nextPage;
  nodeData.maxPage = instances.value.maxPage;

  if (nodeData.nodeCurrentPage < nodeData.maxPage) {
    nodeData.children.push({
      isLoadMore: true,
      daemonId: daemonId,
      key: `${daemonId}-load-more`
    });
  }
};

const handleQueryInstance = throttle(async () => {
  selectedInstance.value = [];
  await initInstancesData();
}, 600);

const toAppDetailPage = (daemonId: string, instanceId: string) => {
  router.push({
    path: `/instances/terminal`,
    query: {
      daemonId,
      instanceId
    }
  });
};

const handleChangeNode = async (item: NodeStatus) => {
  try {
    currentRemoteNode.value = item;
    clearTags();
    selectedInstance.value = [];
    await initInstancesData(true);
    localStorage.setItem("pageSelectedRemote", JSON.stringify(item));
  } catch (err: any) {
    console.error(err.message);
  }
};

const toCreateAppPage = () => {
  router.push({
    path: "/market",
    query: {
      daemonId: currentRemoteNode.value?.uuid
    }
  });
};

const toMarketPage = () => {
  router.push({
    path: "/market",
    query: {
      daemonId: currentRemoteNode.value?.uuid
    }
  });
};

const toNodesPage = () => {
  router.push({
    path: "/node"
  });
};

const multipleMode = ref(false);
const DEFAULT_BATCH_UPLOAD_TARGET_PATH =
  "/mnt/steam/cs2/game/csgo/addons/swiftlys2/plugins/PreAimMode";
const BATCH_UPLOAD_HISTORY_KEY = "batchUploadTargetPathHistory";
const BATCH_UPDATE_REQUEST_INTERVAL = 3200;
const BATCH_UPLOAD_REQUEST_INTERVAL = 250;
const BATCH_TOO_FAST_RETRY_DELAY = 3200;
const BATCH_STATUS_REFRESH_DELAYS = [1500, 4000, 8000, 12000];
const BATCH_UPDATE_POLL_INTERVAL = 2500;
const BATCH_UPDATE_STOP_TIMEOUT = 180000;
const BATCH_UPDATE_ACCEPT_TIMEOUT = 30000;
const BATCH_UPDATE_TASK_TIMEOUT = 40 * 60 * 1000;
const BATCH_UPDATE_KILL_TIMEOUT = 60000;
// 面板把 page_size 卡在 50（daemon_router.ts:39），所以列一台节点的实例必须翻页
const BATCH_NODE_PAGE_SIZE = 50;
type BatchSelectedInstance = InstanceMoreDetail & {
  daemonId?: string;
};

type BatchTaskStatus = "pending" | "running" | "success" | "failed" | "skipped";

interface BatchTaskRow {
  key: string;
  daemonId: string;
  nodeName: string;
  instanceUuid: string;
  name: string;
  action: string;
  status: BatchTaskStatus;
  detail: string;
}

const selectedInstance = ref<BatchSelectedInstance[]>([]);
const selectedGlobalRowKeys = computed(() =>
  selectedInstance.value
    .filter((item) => !!item.daemonId)
    .map((item) => `${item.daemonId}:${item.instanceUuid}`)
);
const globalRowSelection = computed(() => ({
  selectedRowKeys: selectedGlobalRowKeys.value,
  getCheckboxProps: (record: any) => ({
    disabled: !record.inst
  }),
  onSelect: (record: any) => {
    if (!record.inst) return;
    selectInstance(record.inst, record.daemonId);
  },
  onSelectAll: () => {
    selectAllInstances();
  }
}));

const getGlobalTableRowKey = (record: any) => {
  return record.inst ? `${record.daemonId}:${record.inst.instanceUuid}` : record.key;
};

const batchConsoleVisible = ref(false);
const batchConsoleTitle = ref("批量任务控制台");
const batchConsoleRows = ref<BatchTaskRow[]>([]);
const batchUploadVisible = ref(false);
const batchUploadTargetPath = ref(DEFAULT_BATCH_UPLOAD_TARGET_PATH);
const batchUploadOverwrite = ref(true);
const batchUploadFileInput = ref<HTMLInputElement>();
const batchUploadFolderInput = ref<HTMLInputElement>();
const selectedUploadFiles = ref<File[]>([]);
const selectedUploadFolderName = ref("");
const selectedUploadFolderItems = ref<ScanItem[]>([]);
const batchUploadPathHistory = ref<string[]>([]);
const batchUploadSubdirectories = ref<string[]>([]);
const batchUploadDirectoryLoading = ref(false);
const batchUploadDirectoryStatus = ref<"unknown" | "checking" | "exists" | "missing">("unknown");
const batchUploadDirectoryMessage = ref("输入目标目录后会实时检测服务器文件夹");
const batchTaskColumns = [
  { title: "实例", key: "name", width: 220 },
  { title: "节点", key: "daemonId", width: 190 },
  { title: "任务", dataIndex: "action", key: "action", width: 72 },
  { title: "状态", key: "status", width: 96 },
  { title: "进度 / 详情", key: "detail" }
];

const batchStatusText: Record<BatchTaskStatus, string> = {
  pending: "等待",
  running: "执行中",
  success: "成功",
  failed: "失败",
  skipped: "已跳过"
};

const batchStatusColor: Record<BatchTaskStatus, string> = {
  pending: "default",
  running: "processing",
  success: "success",
  failed: "error",
  skipped: "warning"
};

const nodeNameById = computed(() => {
  const map: Record<string, NodeStatus> = {};
  for (const node of nodes.value || []) map[node.uuid] = node;
  return map;
});

// 节点列以前直接打印 daemonId（32 位 UUID），这里换成面板上看到的节点名
const resolveNodeName = (daemonId: string) => {
  const node = nodeNameById.value[daemonId];
  if (node) return computeNodeName(node.ip, node.available, node.remarks);
  return daemonId ? `${daemonId.slice(0, 8)}…` : "本机";
};

const batchRunning = ref(false);
const batchElapsedSeconds = ref(0);
// 真正下发过更新任务的节点数：没有「更新命令」的节点一次都不会下发，汇总文案不能把它们算成「已下发」
let batchDispatchedNodes = 0;
let batchTicker: ReturnType<typeof setInterval> | undefined;

const startBatchTicker = () => {
  const startedAt = Date.now();
  batchElapsedSeconds.value = 0;
  batchRunning.value = true;
  if (batchTicker) clearInterval(batchTicker);
  batchTicker = setInterval(() => {
    batchElapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
  }, 1000);
};

const stopBatchTicker = () => {
  batchRunning.value = false;
  if (batchTicker) clearInterval(batchTicker);
  batchTicker = undefined;
};

onUnmounted(stopBatchTicker);

const formatBatchElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} 分 ${String(rest).padStart(2, "0")} 秒` : `${rest} 秒`;
};

const batchElapsedText = computed(() => formatBatchElapsed(batchElapsedSeconds.value));

// 一键更新一台节点只下发一次，其余行只是共享该节点结果，所以进度按「节点」计；
// 批量上传是每个实例一次，进度就按「行」计。
const batchProgressByNode = ref(false);

const batchNodeProgress = computed(() => {
  const summarize = (groups: BatchTaskRow[][]) => {
    let total = 0;
    let finished = 0;
    let running = 0;
    let waiting = 0;
    let failed = 0;
    for (const rows of groups) {
      if (batchProgressByNode.value && rows.every((row) => row.status === "skipped")) continue;
      total += 1;
      if (rows.some((row) => row.status === "running")) running += 1;
      else if (rows.some((row) => row.status === "failed")) {
        failed += 1;
        finished += 1;
      } else if (rows.some((row) => row.status === "success")) finished += 1;
      else if (rows.some((row) => row.status === "pending")) waiting += 1;
      else if (rows.every((row) => row.status === "skipped")) finished += 1;
    }
    return {
      total,
      finished,
      running,
      waiting,
      failed,
      percent: total ? Math.round((finished / total) * 100) : 0,
      unit: batchProgressByNode.value ? "节点" : "实例"
    };
  };

  const groups = new Map<string, BatchTaskRow[]>();
  for (const row of batchConsoleRows.value) {
    const list = groups.get(row.daemonId);
    if (list) list.push(row);
    else groups.set(row.daemonId, [row]);
  }
  if (batchProgressByNode.value) return summarize([...groups.values()]);
  return summarize(batchConsoleRows.value.map((row) => [row]));
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (err: any) => {
  return err?.message || err?.response?.data || String(err);
};

const isRealPathUnsupportedError = (err: any) => {
  const msg = getErrorMessage(err);
  return msg.includes("未更新到支持真实目录上传的版本") || msg.includes("节点网络不稳定");
};

const isTooFastError = (err: any) => getErrorMessage(err).includes("请求速度过快");

const runWithTooFastRetry = async <T,>(task: () => Promise<T>, row: BatchTaskRow) => {
  try {
    return await task();
  } catch (err: any) {
    if (!isTooFastError(err)) throw err;
    row.detail = "请求速度过快，等待后自动重试";
    await wait(BATCH_TOO_FAST_RETRY_DELAY);
    return await task();
  }
};

const refreshInstancesAfterBatchOperation = async () => {
  await initInstancesData();
  BATCH_STATUS_REFRESH_DELAYS.forEach((delay) => {
    setTimeout(() => {
      initInstancesData().catch((err) => console.error("Failed to refresh instance status:", err));
    }, delay);
  });
};

const loadBatchUploadPathHistory = () => {
  try {
    const raw = localStorage.getItem(BATCH_UPLOAD_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      batchUploadPathHistory.value = parsed
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 8);
    }
  } catch (err) {
    console.error("Failed to load batch upload path history:", err);
    batchUploadPathHistory.value = [];
  }
};

const saveBatchUploadPathHistory = (targetPath: string) => {
  const normalizedPath = targetPath.trim();
  if (!normalizedPath) return;
  const nextHistory = [
    normalizedPath,
    ...batchUploadPathHistory.value.filter((item) => item !== normalizedPath)
  ].slice(0, 8);
  batchUploadPathHistory.value = nextHistory;
  localStorage.setItem(BATCH_UPLOAD_HISTORY_KEY, JSON.stringify(nextHistory));
};

const loadBatchUploadSubdirectories = async (targetPath?: string) => {
  const first = selectedInstance.value[0];
  if (!first?.daemonId) {
    batchUploadSubdirectories.value = [];
    batchUploadDirectoryStatus.value = "unknown";
    batchUploadDirectoryMessage.value = "请先选择要上传的实例";
    return;
  }

  const currentPath = (targetPath || batchUploadTargetPath.value).trim();
  if (!currentPath) {
    batchUploadSubdirectories.value = [];
    batchUploadDirectoryStatus.value = "unknown";
    batchUploadDirectoryMessage.value = "请输入真实服务器目录";
    return;
  }

  batchUploadDirectoryLoading.value = true;
  batchUploadDirectoryStatus.value = "checking";
  batchUploadDirectoryMessage.value = "正在实时检查服务器目录";
  try {
    const { execute } = realFileList();
    const res = await execute({
      params: {
        daemonId: first.daemonId,
        uuid: first.instanceUuid,
        target: currentPath,
        page: 0,
        page_size: 200,
        file_name: ""
      }
    });

    const items = res.value?.items || [];
    batchUploadDirectoryStatus.value = "exists";
    batchUploadDirectoryMessage.value = `目录存在，已获取 ${items.filter((item) => item.type === 0).length} 个子文件夹`;
    batchUploadSubdirectories.value = items
      .filter((item) => item.type === 0)
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("Failed to load upload subdirectories:", err);
    batchUploadDirectoryStatus.value = "missing";
    batchUploadDirectoryMessage.value = isRealPathUnsupportedError(err)
      ? `该节点还没更新到支持真实目录上传的版本：${getErrorMessage(err)}`
      : `目录不存在或无权限访问：${getErrorMessage(err)}`;
    batchUploadSubdirectories.value = [];
  } finally {
    batchUploadDirectoryLoading.value = false;
  }
};

const appendBatchUploadPath = (folderName: string) => {
  const base = batchUploadTargetPath.value.trim().replace(/\/+$/, "");
  if (!folderName) return;
  batchUploadTargetPath.value = `${base}/${folderName}`;
  loadBatchUploadSubdirectories(batchUploadTargetPath.value);
};

const getBatchUploadTargetPath = () => {
  return batchUploadTargetPath.value.trim() || ".";
};

const checkBatchUploadTargetExists = async (row: BatchTaskRow) => {
  const { execute } = realFileList();
  await execute({
    params: {
      daemonId: row.daemonId,
      uuid: row.instanceUuid,
      target: getBatchUploadTargetPath(),
      page: 0,
      page_size: 1,
      file_name: ""
    }
  });
};

const instanceTableColumns: AntColumnsType[] = [
  { title: t("TXT_CODE_f70badb9"), dataIndex: "name", key: "name", width: 250, align: "left" },
  {
    title: t("TXT_CODE_759fb403"),
    dataIndex: "status",
    key: "status",
    width: 100,
    align: "center"
  },
  {
    title: t("TXT_CODE_67d68dd1"),
    dataIndex: "type",
    key: "type",
    width: 160,
    align: "center"
  },
  {
    title: t("TXT_CODE_e06fdab0"),
    dataIndex: "lastDatetime",
    key: "lastDatetime",
    width: 160,
    align: "center"
  },
  { title: t("TXT_CODE_b283e720"), dataIndex: "resources", key: "resources", align: "left" },
  {
    title: t("TXT_CODE_7e9727bd"),
    dataIndex: "players",
    key: "players",
    width: 100,
    align: "left"
  },
  {
    title: t("TXT_CODE_fe731dfc"),
    dataIndex: "actions",
    key: "actions",
    width: 200,
    align: "right"
  }
];

const findInstance = (item: BatchSelectedInstance, daemonId?: string) => {
  const targetDaemonId = daemonId ?? item.daemonId ?? currentRemoteNode.value?.uuid ?? "";
  return selectedInstance.value.find(
    (i) => i.instanceUuid === item.instanceUuid && (i.daemonId ?? "") === targetDaemonId
  );
};

const selectInstance = (item: InstanceMoreDetail, daemonId?: string) => {
  const targetDaemonId = daemonId ?? currentRemoteNode.value?.uuid ?? "";
  const selected = findInstance(item, targetDaemonId);
  if (selected) {
    selectedInstance.value.splice(selectedInstance.value.indexOf(selected), 1);
  } else {
    selectedInstance.value.push({ ...item, daemonId: targetDaemonId });
  }
};

const handleSelectInstance = (item: InstanceMoreDetail) => {
  if (multipleMode.value) {
    selectInstance(item);
  } else {
    toAppDetailPage(currentRemoteNode.value?.uuid || "", item.instanceUuid);
  }
};

const selectAllInstances = () => {
  let allInstancesCount = 0;
  if (isGlobalDaemonMode.value) {
    for (const node of tableTreeData.value) {
      if (!node.children) continue;
      allInstancesCount += node.children.filter((child: any) => child.inst).length;
    }
  } else {
    allInstancesCount = instancesMoreInfo.value.length;
  }

  if (allInstancesCount === selectedInstance.value?.length) return;
  selectedInstance.value = [];

  if (isGlobalDaemonMode.value) {
    for (const node of tableTreeData.value) {
      if (!node.children) continue;
      for (const child of node.children) {
        if (!child.inst || findInstance(child.inst, child.daemonId)) continue;
        selectedInstance.value.push({ ...child.inst, daemonId: child.daemonId });
      }
    }
  } else {
    selectedInstance.value = instancesMoreInfo.value.map((item) => ({
      ...item,
      daemonId: currentRemoteNode.value?.uuid ?? ""
    }));
  }
};

const exitMultipleMode = () => {
  multipleMode.value = false;
  selectedInstance.value = [];
};

const instanceOperations = [
  {
    title: t("TXT_CODE_57245e94"),
    icon: PlayCircleOutlined,
    click: () => batchOperation("start")
  },
  {
    title: t("TXT_CODE_b1dedda3"),
    icon: PauseCircleOutlined,
    click: () => batchOperation("stop")
  },
  {
    title: t("TXT_CODE_47dcfa5"),
    icon: RedoOutlined,
    click: () => batchOperation("restart")
  },
  {
    title: "一键更新",
    icon: CloudDownloadOutlined,
    click: () => openBatchUpdateConsole()
  },
  {
    title: "批量上传",
    icon: UploadOutlined,
    click: () => openBatchUploadDialog()
  },
  {
    title: t("TXT_CODE_7b67813a"),
    icon: CloseOutlined,
    click: () => {
      batchOperation("kill");
    }
  },
  {
    title: t("TXT_CODE_ecbd7449"),
    icon: DeleteOutlined,
    click: () => batchDeleteInstance(false)
  },
  {
    title: t("TXT_CODE_9ef27367"),
    icon: WarningOutlined,
    click: () => batchDeleteInstance(true)
  }
];

const visibleInstanceOperations = computed(() => {
  if (!isGlobalDaemonMode.value) return instanceOperations;
  return instanceOperations.filter(
    (item) => item.icon !== DeleteOutlined && item.icon !== WarningOutlined
  );
});

const batchOperation = async (actName: "start" | "stop" | "kill" | "restart") => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const operationMap = {
    start: async () => exec(batchStart().execute, t("TXT_CODE_2b5fd76e")),
    stop: async () => exec(batchStop().execute, t("TXT_CODE_4822a21")),
    kill: async () => exec(batchKill().execute, t("TXT_CODE_effefaab")),
    restart: async () => exec(batchRestart().execute, t("TXT_CODE_effefaab"))
  };

  const exec = async (fn: Function, msg: string) => {
    try {
      const state = await fn({
        data: selectedInstance.value.map((item) => ({
          instanceUuid: item.instanceUuid,
          daemonId: item.daemonId ?? currentRemoteNode.value?.uuid ?? ""
        }))
      });
      if (state.value) {
        notification.success({
          message: msg,
          description: t("TXT_CODE_1514d08f")
        });
        exitMultipleMode();
        await refreshInstancesAfterBatchOperation();
      }
    } catch (err: any) {
      console.error(err);
      reportErrorMsg(err.message);
    }
  };

  operationMap[actName]();
};

const createBatchRows = (action: string, dedupeByDaemon = true): BatchTaskRow[] => {
  const firstByDaemon = new Map<string, string>();

  return selectedInstance.value.map((item) => {
    const daemonId = item.daemonId ?? currentRemoteNode.value?.uuid ?? "";
    const name = item.config?.nickname || item.instanceUuid;
    const firstName = firstByDaemon.get(daemonId);
    const isDuplicateNode = dedupeByDaemon && Boolean(firstName);
    if (dedupeByDaemon && !firstName) firstByDaemon.set(daemonId, name);

    return {
      key: `${daemonId}:${item.instanceUuid}:${action}`,
      daemonId,
      nodeName: resolveNodeName(daemonId),
      instanceUuid: item.instanceUuid,
      name,
      action,
      status: isDuplicateNode ? "skipped" : "pending",
      detail: isDuplicateNode ? `已跳过，同节点已选择 ${firstName} 作为处理点` : "等待执行"
    };
  });
};

const getExecutableBatchRows = () => {
  return batchConsoleRows.value.filter((row) => row.status !== "skipped");
};

const openBatchUpdateConsole = () => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  batchConsoleTitle.value = "一键更新控制台";
  batchProgressByNode.value = true;
  batchConsoleRows.value = createBatchRows("更新", true);
  const nodeCount = new Set(batchConsoleRows.value.map((row) => row.daemonId)).size;
  const executableCount = getExecutableBatchRows().length;

  Modal.confirm({
    title: "确认执行一键更新",
    content: `已选 ${selectedInstance.value.length} 个应用，分布在 ${nodeCount} 台节点。同一台节点上的实例共用同一份游戏目录，所以每台节点只下发 1 次更新（共 ${executableCount} 次），其余实例标记为「共用该节点文件」。但下发前会把该节点上**所有**实例停止——包括没勾选的，在线玩家会被踢下线。找不到「更新命令」的节点直接跳过且不停服。更新结束后实例保持停止状态，不会自动启动；启动时由 /data/preaim-launch.sh 自动补回 gameinfo.gi 的插件搜索路径。`,
    okText: "开始更新",
    cancelText: t("TXT_CODE_518528d0"),
    onOk: () => {
      // 这里绝不能把 runBatchUpdateTasks() 的 Promise 返回出去：Modal.confirm 会等它 resolve，
      // 于是一个 40 分钟的任务会把确认框一直压在控制台上（表现为「看不见进度」）。
      batchConsoleVisible.value = true;
      runBatchUpdateTasks().catch((err) => console.error("Batch update aborted:", err));
    }
  });
};

// 守护进程对 update 任务是「先应答后执行」，回包恒为 true，所以真实结果只能回读状态机：
// STOPPED -> BUSY -> STOPPED
const readInstanceSnapshot = async (row: BatchTaskRow) => {
  const { execute } = getInstanceInfo();
  const res = await execute({
    // 面板的请求层有 2 秒同源缓存，回读状态必须绕开它，否则会重复拿到同一份旧状态
    forceRequest: true,
    params: {
      daemonId: row.daemonId,
      uuid: row.instanceUuid
    }
  });
  return res.value;
};

const waitInstanceStatus = async (
  row: BatchTaskRow,
  accept: (status: number) => boolean,
  timeout: number,
  describe: (elapsedSeconds: number) => string
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await wait(BATCH_UPDATE_POLL_INTERVAL);
    row.detail = describe(Math.round((Date.now() - startedAt) / 1000));
    let status = Number.NaN;
    try {
      status = Number((await readInstanceSnapshot(row))?.status);
    } catch {
      continue; // 轮询期间的读取抖动不作为任务失败
    }
    if (accept(status)) return true;
  }
  return false;
};

// 一台节点的实例清单（面板把 page_size 卡在 50，所以要翻页取全）
const listNodeInstances = async (daemonId: string) => {
  const { execute } = remoteInstances();
  const all: InstanceDetail[] = [];
  for (let page = 1; page <= 6; page++) {
    const res = await execute({
      // 轮询必须绕开面板请求层的 2 秒同源缓存，否则会反复拿到同一份旧状态
      forceRequest: true,
      params: {
        daemonId,
        page,
        page_size: BATCH_NODE_PAGE_SIZE,
        status: "",
        instance_name: "",
        tag: "[]"
      }
    });
    const list = res.value?.data || [];
    all.push(...list);
    if (list.length < BATCH_NODE_PAGE_SIZE) break;
  }
  return all;
};

const aliveInstances = (list: InstanceDetail[]) =>
  list.filter((item) => Number(item.status) !== INSTANCE_STATUS_CODE.STOPPED);

// 更新前把这台节点上的**所有**实例关掉：同节点实例共用同一份 /mnt/steam/cs2，
// 只要还有一个在跑，steamcmd 就是在改一批正被读写的文件。
const stopNodeInstances = async (daemonId: string, selectedUuids: string[], row: BatchTaskRow) => {
  const label = (item: InstanceDetail) => item.config?.nickname || item.instanceUuid;
  const firstList = await listNodeInstances(daemonId);
  let alive = aliveInstances(firstList);
  const unselectedAlive = alive.filter((item) => !selectedUuids.includes(item.instanceUuid));
  const total = firstList.length;
  if (alive.length === 0)
    return { allStopped: true, remaining: [] as string[], total, unselectedStopped: 0 };

  const issue = async (targets: InstanceDetail[], act: "stop" | "kill") => {
    const { execute } = act === "stop" ? batchStop() : batchKill();
    await execute({
      data: targets.map((item) => ({ instanceUuid: item.instanceUuid, daemonId }))
    });
  };

  await issue(alive, "stop");
  let startedAt = Date.now();
  while (Date.now() - startedAt < BATCH_UPDATE_STOP_TIMEOUT) {
    await wait(BATCH_UPDATE_POLL_INTERVAL);
    alive = aliveInstances(await listNodeInstances(daemonId));
    row.detail =
      `正在停止该节点 ${total} 个实例（含未勾选的 ${unselectedAlive.length} 个），` +
      `剩 ${alive.length} 个 · ${Math.round((Date.now() - startedAt) / 1000)}s`;
    if (alive.length === 0)
      return {
        allStopped: true,
        remaining: [] as string[],
        total,
        unselectedStopped: unselectedAlive.length
      };
  }

  // 优雅停止超时 -> 强制终止（docker 模式下就是删容器）。还停不掉就是节点侧的问题，不硬撑。
  row.detail = `优雅停止超时，改为强制终止 ${alive.length} 个实例`;
  await issue(alive, "kill");
  startedAt = Date.now();
  while (Date.now() - startedAt < BATCH_UPDATE_KILL_TIMEOUT) {
    await wait(BATCH_UPDATE_POLL_INTERVAL);
    alive = aliveInstances(await listNodeInstances(daemonId));
    row.detail = `强制终止后仍剩 ${alive.length} 个未停止 · ${Math.round((Date.now() - startedAt) / 1000)}s`;
    if (alive.length === 0)
      return {
        allStopped: true,
        remaining: [] as string[],
        total,
        unselectedStopped: unselectedAlive.length
      };
  }
  return {
    allStopped: false,
    remaining: alive.map(label),
    total,
    unselectedStopped: unselectedAlive.length
  };
};

const runNodeUpdate = async (rows: BatchTaskRow[]) => {
  const finish = (row: BatchTaskRow, status: BatchTaskStatus, message: string) => {
    row.status = status;
    row.detail = message;
    for (const sibling of rows) {
      if (sibling === row || sibling.status !== "pending") continue;
      sibling.status = "skipped";
      sibling.detail = `未单独下发（与 ${row.name} 共用同一份游戏目录）；该节点结果：${message}`;
    }
  };

  // 第一步：只读状态挑处理点。这一步绝不停服——整台节点没有可用「更新命令」时不该牵连任何实例。
  let target: BatchTaskRow | null = null;
  for (const candidate of rows) {
    candidate.status = "running";
    candidate.detail = "正在读取实例状态与更新命令";
    let snapshot: InstanceDetail | undefined;
    try {
      snapshot = await readInstanceSnapshot(candidate);
    } catch (err) {
      candidate.status = "failed";
      candidate.detail = `无法读取该实例信息：${getErrorMessage(err)}`;
      continue;
    }
    if (!snapshot) {
      candidate.status = "failed";
      candidate.detail = "该实例信息返回为空，已跳过这个候选处理点";
      continue;
    }
    if (!String(snapshot.config?.updateCommand ?? "").trim()) {
      candidate.status = "skipped";
      candidate.detail = "未配置「更新命令」，不作为处理点";
      continue;
    }
    if (Number(snapshot.status) === INSTANCE_STATUS_CODE.BUSY) {
      candidate.status = "failed";
      candidate.detail = "该实例已有其他异步任务在运行中，已跳过这个候选处理点";
      continue;
    }
    target = candidate;
    break;
  }
  if (!target) return;
  const row = target;

  // 第二步：关掉该节点上的所有实例（含未勾选的）
  row.detail = "正在清点该节点上的全部实例";
  const stopResult = await stopNodeInstances(
    row.daemonId,
    rows.map((item) => item.instanceUuid),
    row
  ).catch((err) => {
    finish(row, "failed", `无法读取或停止该节点实例：${getErrorMessage(err)}`);
    return null;
  });
  if (!stopResult) return;
  if (!stopResult.allStopped) {
    return finish(
      row,
      "failed",
      `该节点仍有 ${stopResult.remaining.length} 个实例未停止（${stopResult.remaining.join("、")}），已中止且未下发任务`
    );
  }

  // 第三步：下发更新。守护进程对 update 是先应答后执行，所以真实进度只能回读状态机。
  batchDispatchedNodes += 1;
  row.detail = "该节点实例已全部停止，正在下发更新任务";
  try {
    const { execute } = updateInstance();
    await execute({
      params: {
        uuid: row.instanceUuid,
        daemonId: row.daemonId,
        task_name: "update"
      },
      data: {
        time: Date.now()
      }
    });
  } catch (err) {
    return finish(row, "failed", `更新任务下发失败：${getErrorMessage(err)}`);
  }

  const accepted = await waitInstanceStatus(
    row,
    (s) => s === INSTANCE_STATUS_CODE.BUSY,
    BATCH_UPDATE_ACCEPT_TIMEOUT,
    (elapsed) =>
      `任务已下发，等待进入更新状态 ${elapsed}s / ${BATCH_UPDATE_ACCEPT_TIMEOUT / 1000}s`
  );
  if (!accepted)
    return finish(
      row,
      "failed",
      "未观察到更新任务进入运行态：任务可能被守护进程拒绝，或已瞬间结束，请查看该实例终端"
    );

  const done = await waitInstanceStatus(
    row,
    (s) => s === INSTANCE_STATUS_CODE.STOPPED,
    BATCH_UPDATE_TASK_TIMEOUT,
    (elapsed) =>
      `更新中 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒，完成后不会自动启动`
  );
  if (!done)
    return finish(
      row,
      "failed",
      `更新超过 ${BATCH_UPDATE_TASK_TIMEOUT / 60000} 分钟仍未结束，任务可能仍在执行，请到该实例终端确认`
    );

  return finish(
    row,
    "success",
    `更新流程已结束；该节点 ${stopResult.total} 个实例已全部停止（含未勾选的 ${stopResult.unselectedStopped} 个），不会自动启动`
  );
};

const runBatchUpdateTasks = async () => {
  batchDispatchedNodes = 0;
  const groups = new Map<string, BatchTaskRow[]>();
  for (const row of batchConsoleRows.value) {
    const list = groups.get(row.daemonId);
    if (list) list.push(row);
    else groups.set(row.daemonId, [row]);
  }

  const runners: Promise<void>[] = [];
  let nodeIndex = 0;
  for (const [, rows] of groups) {
    if (rows.every((row) => row.status === "skipped")) continue;
    // 先同步把整组置为等待，避免异步执行器改写状态后又被后面的分组判断读到
    for (const row of rows) {
      row.status = "pending";
      row.detail = "等待执行";
    }
    // 不同节点并行，但错开下发时刻，非管理员账号也要避开面板的 3 秒同源限制
    const startDelay = nodeIndex * BATCH_UPDATE_REQUEST_INTERVAL;
    nodeIndex += 1;
    runners.push(
      (async () => {
        await wait(startDelay);
        await runNodeUpdate(rows);
      })()
    );
  }
  if (runners.length === 0) return;

  startBatchTicker();
  await Promise.all(runners);
  const elapsedText = formatBatchElapsed(batchElapsedSeconds.value);
  stopBatchTicker();
  const failedCount = batchConsoleRows.value.filter((row) => row.status === "failed").length;
  const summary =
    batchDispatchedNodes === 0
      ? {
          message: `一键更新未下发任何任务（用时 ${elapsedText}）`,
          description: `候选的 ${runners.length} 台节点都没有可用的「更新命令」，没有停服、也没有下发更新`
        }
      : {
          message: `一键更新已结束（用时 ${elapsedText}）`,
          description: `在 ${batchDispatchedNodes}/${runners.length} 台候选节点下发了更新，${failedCount} 行失败，逐行结果见本控制台`
        };
  if (failedCount > 0) notification.warning(summary);
  else notification.success(summary);
  await refreshInstancesAfterBatchOperation();
};

const openBatchUploadDialog = () => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  selectedUploadFiles.value = [];
  selectedUploadFolderName.value = "";
  selectedUploadFolderItems.value = [];
  batchUploadOverwrite.value = true;
  batchUploadTargetPath.value = DEFAULT_BATCH_UPLOAD_TARGET_PATH;
  batchUploadSubdirectories.value = [];
  batchUploadDirectoryStatus.value = "unknown";
  batchUploadDirectoryMessage.value = "输入目标目录后会实时检测服务器文件夹";
  batchUploadVisible.value = true;
  loadBatchUploadSubdirectories(batchUploadTargetPath.value);
};

const onSelectBatchFiles = (event: Event) => {
  const input = event.target as HTMLInputElement;
  selectedUploadFiles.value = Array.from(input.files || []);
  selectedUploadFolderName.value = "";
  selectedUploadFolderItems.value = [];
};

const onSelectBatchFolder = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  selectedUploadFiles.value = [];
  selectedUploadFolderItems.value = files
    .map((file) => {
      const fullPath = (file as any).webkitRelativePath || file.name;
      const parts = fullPath.split("/");
      selectedUploadFolderName.value = parts[0] || "folder";
      return {
        path: fullPath,
        file,
        isDir: false
      };
    })
    .filter((item) => !!item.path);
};

const runBatchUpload = async () => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  if (selectedUploadFiles.value.length === 0 && selectedUploadFolderItems.value.length === 0) {
    return reportErrorMsg("请选择要上传的文件或文件夹");
  }

  saveBatchUploadPathHistory(getBatchUploadTargetPath());

  batchUploadVisible.value = false;
  batchConsoleTitle.value = "批量上传控制台";
  batchProgressByNode.value = false;
  batchConsoleRows.value = createBatchRows("上传", false);
  batchConsoleVisible.value = true;
  const rows = getExecutableBatchRows();

  let uploadFiles: { file: File; unzip: boolean }[];
  if (selectedUploadFolderItems.value.length > 0) {
    const folderName = selectedUploadFolderName.value || "folder";
    const zipUint8 = await compressFolder([
      { path: `${folderName}/`, isDir: true },
      ...selectedUploadFolderItems.value
    ]);
    const zipFile = new File([zipUint8 as any], `batch_upload_${folderName}_${Date.now()}.zip`, {
      type: "application/zip"
    });
    uploadFiles = [{ file: zipFile, unzip: true }];
  } else {
    uploadFiles = selectedUploadFiles.value.map((file) => ({ file, unzip: false }));
  }

  let successCount = 0;
  startBatchTicker();
  for (const [index, row] of rows.entries()) {
    if (index > 0) await wait(BATCH_UPLOAD_REQUEST_INTERVAL);
    row.status = "running";
    row.detail = "正在准备上传任务";

    try {
      row.detail = "正在检查目标目录";
      await runWithTooFastRetry(() => checkBatchUploadTargetExists(row), row);
      row.detail = "正在准备上传任务";
      for (const item of uploadFiles) {
        await runWithTooFastRetry(() => appendUploadFile(row, item.file, item.unzip), row);
      }
      row.status = "success";
      row.detail = "上传任务已加入队列，可在右下角上传进度中查看";
      successCount += 1;
    } catch (err: any) {
      row.status = "failed";
      row.detail = isRealPathUnsupportedError(err)
        ? "该节点还没更新到支持真实目录上传的版本"
        : getErrorMessage(err);
      reportErrorMsg(`${row.name}: ${row.detail}`);
    }
  }

  stopBatchTicker();
  message.success(`批量上传任务已创建：${successCount}/${rows.length} 个实例`);
};

const appendUploadFile = async (row: BatchTaskRow, file: File, unzip: boolean) => {
  const { execute } = getFileUploadAddress();
  const res = await execute({
    params: {
      upload_dir: getBatchUploadTargetPath(),
      daemonId: row.daemonId,
      uuid: row.instanceUuid,
      file_name: file.name,
      real_path: true
    }
  });
  if (!res.value) throw new Error("上传通道创建失败");

  const addr = parseForwardAddress(getFileConfigAddr(res.value), "http");
  uploadService.append(
    file,
    addr,
    res.value.password,
    {
      overwrite: batchUploadOverwrite.value,
      unzip,
      code: "utf-8",
      deleteAfterUnzip: unzip
    },
    (task) => {
      task.instanceInfo = {
        instanceId: row.instanceUuid,
        daemonId: row.daemonId
      };
    }
  );
};

const batchDeleteInstance = async (deleteFile: boolean) => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const { execute, state } = batchDelete();
  const uuids: string[] = [];
  const paths: string[] = [];
  for (const i of selectedInstance.value) {
    uuids.push(i.instanceUuid);
    if (i.config?.cwd) {
      paths.push(i.config.cwd);
    }
  }
  const confirmDeleteInstanceModal = Modal.confirm({
    title: t("TXT_CODE_2a3b0c17"),
    icon: h(InfoCircleOutlined),
    content: () =>
      h("div", {}, [
        h("p", {}, deleteFile ? t("TXT_CODE_18d2f8ae") : t("TXT_CODE_ac01315a")),
        paths.length > 1
          ? null
          : h("p", { style: "margin-top: 8px; color: #666;" }, [
              t("TXT_CODE_91d70059"),
              h("br"),
              paths.join()
            ])
      ]),
    okText: t("TXT_CODE_d507abff"),
    async onOk() {
      try {
        await execute({
          params: {
            daemonId: currentRemoteNode.value?.uuid ?? ""
          },
          data: {
            uuids: uuids,
            deleteFile: deleteFile
          }
        });
        if (state.value) {
          confirmDeleteInstanceModal.destroy();
          exitMultipleMode();
          notification.success({
            message: t("TXT_CODE_c3c06801"),
            description: t("TXT_CODE_50075e02")
          });
          await initInstancesData(true);
        }
      } catch (err: any) {
        console.error(err);
        reportErrorMsg(err.message);
      }
    },
    onCancel() {}
  });
};

const globalNode = {
  uuid: ALL_DAEMON_MODE,
  ip: "",
  port: 0,
  available: true,
  remarks: ""
};

onMounted(async () => {
  loadBatchUploadPathHistory();
  await initInstancesData();
  setRefreshFn(initInstancesData);
});
</script>

<template>
  <div style="min-height: 100%" class="container">
    <a-row :gutter="[24, 24]" style="min-height: 100%">
      <a-col :span="24">
        <BetweenMenus>
          <template v-if="!isPhone" #left>
            <a-typography-title class="mb-0" :level="4">
              <AppstoreOutlined />
              {{ card.title }}
            </a-typography-title>
          </template>
          <template #right>
            <a-dropdown>
              <template #overlay>
                <a-menu>
                  <a-menu-item :key="ALL_DAEMON_MODE" @click="handleChangeNode(globalNode)">
                    <AppstoreOutlined />
                    {{ t("TXT_CODE_a60a421a") }}
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item
                    v-for="item in nodes"
                    :key="item.uuid"
                    :disabled="!item.available"
                    @click="handleChangeNode(item)"
                  >
                    <DatabaseOutlined v-if="item.available" />
                    <FrownOutlined v-else />
                    {{ computeNodeName(item.ip, item.available, item.remarks) }}
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="toNodesPage" @click="toNodesPage()">
                    <FormOutlined />
                    {{ t("TXT_CODE_28e53fed") }}
                  </a-menu-item>
                </a-menu>
              </template>
              <a-button style="max-width: 200px; min-width: 180px; overflow: hidden">
                <a-typography-text
                  style="max-width: 145px"
                  :ellipsis="{ ellipsis: true }"
                  :content="
                    isGlobalDaemonMode
                      ? t('TXT_CODE_a60a421a')
                      : computeNodeName(
                          currentRemoteNode?.ip || '',
                          currentRemoteNode?.available || true,
                          currentRemoteNode?.remarks
                        )
                  "
                />
                <DownOutlined />
              </a-button>
            </a-dropdown>
            <a-button @click="scheduleManagerDialog?.openDialog()">
              <FieldTimeOutlined />
              计划管理
            </a-button>
            <a-button
              type="primary"
              :disabled="!currentRemoteNode?.available"
              @click="toCreateAppPage"
            >
              {{ t("TXT_CODE_53408064") }}
            </a-button>
          </template>
          <template #center>
            <div class="search-input">
              <a-input-group compact>
                <a-select
                  v-model:value="operationForm.status"
                  style="width: 90px"
                  @change="handleQueryInstance"
                >
                  <a-select-option value="">
                    {{ t("TXT_CODE_c48f6f64") }}
                  </a-select-option>
                  <a-select-option v-for="(p, i) in INSTANCE_STATUS" :key="i" :value="i">
                    {{ p }}
                  </a-select-option>
                </a-select>
                <a-input
                  v-model:value.trim="operationForm.instanceName"
                  :placeholder="t('TXT_CODE_ce132192')"
                  style="width: calc(100% - 90px)"
                  @press-enter="handleQueryInstance"
                  @change="handleQueryInstance"
                >
                  <template #suffix>
                    <search-outlined />
                  </template>
                </a-input>
              </a-input-group>
            </div>
          </template>
        </BetweenMenus>
      </a-col>
      <a-col :span="24">
        <BetweenMenus>
          <template v-if="instances || isGlobalDaemonMode" #left>
            <div v-if="multipleMode">
              <a-button class="mr-10" @click="exitMultipleMode">
                {{ t("TXT_CODE_5366af54") }}
              </a-button>

              <a-button
                v-if="
                  (isGlobalDaemonMode
                    ? tableTreeData.reduce(
                        (total, node) =>
                          total + (node.children || []).filter((child: any) => child.inst).length,
                        0
                      )
                    : instancesMoreInfo.length) === selectedInstance.length
                "
                class="mr-10"
                @click="selectedInstance = []"
              >
                {{ t("TXT_CODE_df87c46d") }}
              </a-button>
              <a-button v-else class="mr-10" @click="selectAllInstances">
                {{ t("TXT_CODE_f466d7a") }}
              </a-button>
              <a-dropdown>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      v-for="item in visibleInstanceOperations"
                      :key="item.title"
                      @click="item.click"
                    >
                      <component :is="item.icon" />
                      {{ item.title }}
                    </a-menu-item>
                  </a-menu>
                </template>
                <a-button type="primary">
                  {{ t("TXT_CODE_8fd8bfd3") }}
                  <DownOutlined />
                </a-button>
              </a-dropdown>
            </div>
            <div v-else>
              <a-button @click="multipleMode = true">
                {{ t("TXT_CODE_5cb656b9") }}
              </a-button>
              <a-button class="ml-10" @click="handleQueryInstance">
                {{ t("TXT_CODE_b76d94e0") }}
              </a-button>
            </div>
          </template>
          <template v-if="multipleMode" #center>
            <a-typography-text>
              {{ t("TXT_CODE_432cbc38") }}{{ selectedInstance?.length || 0 }}
              {{ t("TXT_CODE_5cd3b4bd") }}
            </a-typography-text>
          </template>
          <template v-if="instances && !isGlobalDaemonMode" #right>
            <a-pagination
              v-model:current="operationForm.currentPage"
              v-model:pageSize="operationForm.pageSize"
              :total="(instances?.maxPage || 0) * operationForm.pageSize"
              show-size-changer
              @change="initInstancesData()"
            />
          </template>
        </BetweenMenus>
      </a-col>
      <a-col :span="24">
        <div v-if="tagTips && tagTips?.length > 0" class="instances-tag-container">
          <a-tag
            v-if="selectedTags.length > 0"
            color="red"
            class="group-name-tag"
            @click="clearTags"
          >
            {{ t("TXT_CODE_7333c7f7") }}
          </a-tag>
          <a-tag
            v-for="item in tagTips"
            :key="item"
            class="group-name-tag"
            :class="{ 'group-name-tag-active': isTagSelected(item) }"
            @click="isTagSelected(item) ? removeTag(item) : selectTag(item)"
          >
            {{ item }}
          </a-tag>
        </div>
      </a-col>
      <a-col v-if="isLoading" :span="24">
        <Loading></Loading>
      </a-col>

      <a-col v-else-if="!isGlobalDaemonMode && instancesMoreInfo?.length > 0" :span="24">
        <a-row :gutter="[16, 16]">
          <fade-up-animation>
            <a-col
              v-for="item in instancesMoreInfo"
              :key="item.instanceUuid"
              :span="24"
              :xl="6"
              :lg="8"
              :sm="12"
            >
              <Shortcut
                class="instance-card"
                :class="{ selected: multipleMode && findInstance(item) }"
                style="height: 100%"
                :card="card"
                :target-instance-info="item"
                :target-daemon-id="currentRemoteNode?.uuid"
                @click="handleSelectInstance(item)"
                @refresh-list="initInstancesData()"
              />
            </a-col>
          </fade-up-animation>
        </a-row>
      </a-col>

      <a-col v-else-if="isGlobalDaemonMode" :span="24">
        <fade-up-animation>
          <a-table
            :data-source="tableTreeData"
            :columns="instanceTableColumns"
            :pagination="false"
            size="small"
            :row-key="getGlobalTableRowKey"
            :row-selection="multipleMode ? globalRowSelection : undefined"
            :default-expand-all-rows="true"
            :scroll="{ x: 'max-content' }"
          >
            <template #headerCell="{ column }">
              <div v-if="column.key === 'name'" style="margin-left: 25px">
                {{ column.title }}
              </div>
              <div v-else-if="column.key === 'actions'" style="padding-right: 10px">
                {{ column.title }}
              </div>
              <div v-else>
                {{ column.title }}
              </div>
            </template>

            <template #bodyCell="{ column, record }">
              <template v-if="record.isLoadMore">
                <div
                  v-if="column.key === 'name'"
                  style="text-align: center; cursor: pointer; color: var(--color-blue-6)"
                  @click="loadMoreInstances(record.daemonId)"
                >
                  {{ t("TXT_CODE_101ef36f") }}
                </div>
              </template>
              <InstanceLine
                v-else
                :column="column"
                :record="record"
                :target-instance-info="record.inst"
                :target-daemon-id="record.daemonId"
                :multiple-mode="multipleMode"
                @select-instance="selectInstance"
                @refresh-list="
                  (daemonId: string, instanceId: string) =>
                    initInstancesData(false, daemonId, instanceId)
                "
              ></InstanceLine>
            </template>
          </a-table>
        </fade-up-animation>
      </a-col>

      <a-col
        v-else-if="instancesMoreInfo?.length === 0"
        :span="24"
        class="flex align-center justify-center h-100 w-100 flex-col"
        style="position: relative"
      >
        <div>
          <Empty :description="t('TXT_CODE_5415f009')" />
        </div>
        <div class="mt-20">
          <a-button type="primary" @click="toMarketPage">
            {{ t("TXT_CODE_871cb8bc") }}
          </a-button>
        </div>
      </a-col>
    </a-row>

    <a-drawer
      v-model:open="batchConsoleVisible"
      :title="batchConsoleTitle"
      :width="isPhone ? '100%' : 1040"
      placement="right"
    >
      <a-alert
        class="mb-20"
        type="info"
        show-icon
        message="批量重启/上传会对每个选中的实例分别执行；一键更新按节点去重（同节点实例共用同一份游戏目录，每台节点只下发一次），但下发前会先停掉该节点上的所有实例（含未勾选的），并在下发前后回读实例真实状态，逐行结果以本表为准。"
      />
      <div v-if="batchNodeProgress.total > 0" class="mb-20">
        <a-progress
          :percent="batchNodeProgress.percent"
          :status="
            batchNodeProgress.failed > 0
              ? 'exception'
              : batchRunning
                ? 'active'
                : 'success'
          "
        />
        <div class="batch-progress-summary">
          <span>
            {{ batchNodeProgress.unit }} {{ batchNodeProgress.finished }}/{{
              batchNodeProgress.total
            }} 已完成 · {{ batchNodeProgress.running }} 个进行中 ·
            {{ batchNodeProgress.waiting }} 个排队 · {{ batchNodeProgress.failed }} 个失败
          </span>
          <span class="batch-progress-elapsed">已用 {{ batchElapsedText }}</span>
        </div>
      </div>
      <a-table
        :columns="batchTaskColumns"
        :data-source="batchConsoleRows"
        :pagination="false"
        size="small"
        row-key="key"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="batch-cell-name">{{ record.name }}</div>
          </template>
          <template v-if="column.key === 'daemonId'">
            <div class="batch-cell-node">{{ record.nodeName }}</div>
          </template>
          <template v-if="column.key === 'status'">
            <a-tag :color="batchStatusColor[record.status as BatchTaskStatus]">
              {{ batchStatusText[record.status as BatchTaskStatus] }}
            </a-tag>
          </template>
          <template v-if="column.key === 'detail'">
            <div class="batch-cell-detail">{{ record.detail }}</div>
          </template>
        </template>
      </a-table>
    </a-drawer>

    <a-modal
      v-model:open="batchUploadVisible"
      title="批量上传"
      ok-text="开始上传"
      :cancel-text="t('TXT_CODE_518528d0')"
      @ok="runBatchUpload"
    >
        <a-alert
          class="mb-20"
          type="info"
          show-icon
          message="本次会直接上传到每个选中服务器的真实文件系统；目标目录必须是 /mnt/steam/cs2 下的绝对路径。"
        />
      <a-form layout="vertical">
        <a-form-item label="目标目录">
          <a-space direction="vertical" style="width: 100%" :size="8">
            <a-auto-complete
              v-model:value="batchUploadTargetPath"
              :options="batchUploadPathHistory.map((item) => ({ value: item }))"
              placeholder="/mnt/steam/cs2/game/csgo/addons/swiftlys2/plugins/PreAimMode"
              style="width: 100%"
              @change="(value) => loadBatchUploadSubdirectories(String(value || ''))"
            >
              <a-input />
            </a-auto-complete>
            <a-space wrap>
              <a-button size="small" :loading="batchUploadDirectoryLoading" @click="loadBatchUploadSubdirectories()">
                刷新子目录
              </a-button>
              <a-dropdown v-if="batchUploadSubdirectories.length > 0">
                <a-button size="small">
                  选择子目录
                  <DownOutlined />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      v-for="folderName in batchUploadSubdirectories"
                      :key="folderName"
                      @click="appendBatchUploadPath(folderName)"
                    >
                      {{ folderName }}
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
            <a-space>
              <a-tag
                :color="
                  batchUploadDirectoryStatus === 'exists'
                    ? 'success'
                    : batchUploadDirectoryStatus === 'missing'
                      ? 'error'
                      : batchUploadDirectoryStatus === 'checking'
                        ? 'processing'
                        : 'default'
                "
              >
                {{
                  batchUploadDirectoryStatus === "exists"
                    ? "目录存在"
                    : batchUploadDirectoryStatus === "missing"
                      ? "目录不可用"
                      : batchUploadDirectoryStatus === "checking"
                        ? "检查中"
                        : "未检查"
                }}
              </a-tag>
              <a-typography-text type="secondary">
                {{ batchUploadDirectoryMessage }}
              </a-typography-text>
            </a-space>
          </a-space>
          <a-typography-text type="secondary">
            默认目录：/mnt/steam/cs2/game/csgo/addons/swiftlys2/plugins/PreAimMode，上传前会检测该目录是否存在。
          </a-typography-text>
        </a-form-item>
        <a-form-item label="选择内容">
          <a-space>
            <a-button @click="batchUploadFileInput?.click()">选择文件</a-button>
            <a-button @click="batchUploadFolderInput?.click()">选择文件夹</a-button>
          </a-space>
          <input
            ref="batchUploadFileInput"
            type="file"
            multiple
            style="display: none"
            @change="onSelectBatchFiles"
          />
          <input
            ref="batchUploadFolderInput"
            type="file"
            webkitdirectory
            directory
            multiple
            style="display: none"
            @change="onSelectBatchFolder"
          />
        </a-form-item>
        <a-form-item label="同名文件">
          <a-checkbox v-model:checked="batchUploadOverwrite">覆盖已存在的文件</a-checkbox>
        </a-form-item>
        <a-typography-text type="secondary">
          {{
            selectedUploadFolderItems.length
              ? `已选择文件夹：${selectedUploadFolderName}（${selectedUploadFolderItems.length} 个文件）`
              : selectedUploadFiles.length
                ? `已选择 ${selectedUploadFiles.length} 个文件`
                : "还未选择上传内容"
          }}
        </a-typography-text>
      </a-form>
    </a-modal>

    <ScheduleManager ref="scheduleManagerDialog" />
  </div>
</template>

<style lang="scss" scoped>
.search-input {
  transition: all 0.6s;
  text-align: center;
  width: 80%;
}

@media (max-width: 992px) {
  .search-input {
    transition: all 0.4s;
    text-align: center;
    width: 100% !important;
  }
}

.search-input:hover {
  width: 100%;
}

.instances-tag-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-right: -4px;
  margin-left: -4px;
  max-height: 114px;
  overflow-y: auto;

  .group-name-tag {
    background-color: var(--color-gray-4);
    margin: 4px;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.3s;
    &:hover {
      border-color: var(--color-gray-8);
    }
  }

  .group-name-tag-active {
    background-color: var(--color-green-1) !important;
    border-color: var(--color-green-3);
    color: var(--color-green-7);
  }
}

.batch-progress-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 16px;
  font-size: 13px;
  margin-top: -12px;
}

.batch-progress-elapsed {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  white-space: nowrap;
}

.batch-cell-name,
.batch-cell-node {
  overflow-wrap: anywhere;
}

.batch-cell-node {
  font-size: 12px;
  opacity: 0.72;
}

.batch-cell-detail {
  font-size: 12px;
  line-height: 1.55;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
