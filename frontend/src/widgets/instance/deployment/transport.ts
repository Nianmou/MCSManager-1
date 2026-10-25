import { remoteInstancesGlobal, remoteNodeList } from "@/services/apis";
import {
  addFolder,
  compressFile,
  copyFile,
  fileContent,
  fileList,
  getFileStatus,
  uploadAddress
} from "@/services/apis/fileManager";
import { useAppStateStore } from "@/stores/useAppStateStore";
import uploadService from "@/services/uploadService";
import { getFileConfigAddr } from "@/hooks/useFileManager";
import { parseForwardAddress } from "@/tools/protocol";
import { GLOBAL_INSTANCE_UUID } from "@/config/const";
import { deploymentError } from "./package";
import {
  instanceKey,
  type DeploymentDiscovery,
  type DeploymentTransport,
  type DeploymentInstance
} from "./workflow";

// Several legacy file routes also apply the panel's eight-requests/second
// session guard. Serialize request starts across dialogs, including paginated reads.
let requestGate = Promise.resolve();
function pace() {
  const turn = requestGate.then(() => new Promise<void>((resolve) => setTimeout(resolve, 160)));
  requestGate = turn;
  return turn;
}

export function createDeploymentTransport(): DeploymentTransport {
  const checkAdmin = () => {
    if (!useAppStateStore().isAdmin.value) deploymentError("admin");
  };
  const params = (daemonId: string) => {
    checkAdmin();
    return { daemonId, uuid: GLOBAL_INSTANCE_UUID };
  };
  return {
    async discover() {
      checkAdmin();
      await pace();
      const fresh = { forceRequest: true, timeout: 30000, errorAlert: false };
      const nodes = (await remoteNodeList().execute(fresh)).value;
      if (!Array.isArray(nodes)) return deploymentError("inventory");
      const instances = new Map<string, DeploymentInstance>();
      const issues: NonNullable<DeploymentDiscovery["issues"]> = {};
      for (const node of nodes) if (!node.available) issues[node.uuid] = "offline";
      let maxPage = 1;
      const pages = new Map<string, number>();
      for (let page = 1; page <= maxPage; page++) {
        await pace();
        let data;
        try {
          data = (
            await remoteInstancesGlobal().execute({
              params: { page, page_size: 50 },
              ...fresh
            })
          ).value;
        } catch {
          for (const node of nodes)
            if (!issues[node.uuid] && (page === 1 || page <= (pages.get(node.uuid) || 0)))
              issues[node.uuid] = "inventory";
          break;
        }
        for (const { uuid: daemonId } of nodes) {
          if (issues[daemonId] || (page > 1 && page > (pages.get(daemonId) || 0))) continue;
          const entry = data?.[daemonId];
          if (
            !entry ||
            entry.error ||
            !Array.isArray(entry.instances) ||
            !Number.isSafeInteger(entry.maxPage) ||
            entry.maxPage < 0 ||
            entry.maxPage > 10000 ||
            (entry.page !== undefined && entry.page !== page) ||
            (page > 1 && entry.maxPage !== pages.get(daemonId))
          ) {
            issues[daemonId] = "inventory";
            continue;
          }
          if (page === 1) {
            pages.set(daemonId, entry.maxPage);
            maxPage = Math.max(maxPage, entry.maxPage);
          }
          for (const instance of entry.instances) {
            if (!instance?.instanceUuid || !instance.config || !Number.isInteger(instance.status)) {
              issues[daemonId] = "inventory";
              continue;
            }
            const row: DeploymentInstance = {
              daemonId,
              instanceUuid: instance.instanceUuid,
              name: instance.config.nickname,
              status: instance.status,
              cwd: instance.config.cwd,
              command: instance.config.startCommand
            };
            instances.set(instanceKey(row), row);
          }
        }
      }
      return { nodes, instances: [...instances.values()], issues };
    },
    async list(daemonId, target) {
      const items = [];
      let absolutePath = "";
      for (let page = 0; ; page++) {
        await pace();
        const result = (
          await fileList().execute({
            params: { ...params(daemonId), target, page, page_size: 100, file_name: "" },
            forceRequest: true
          })
        ).value;
        if (!result?.items || !result.absolutePath) return deploymentError("unsupported");
        absolutePath = result.absolutePath;
        items.push(...result.items);
        if (items.length >= result.total) break;
      }
      return { items, absolutePath };
    },
    async status(daemonId) {
      await pace();
      const result = (
        await getFileStatus().execute({ params: params(daemonId), forceRequest: true })
      ).value;
      if (!result || !result.isGlobalInstance) return deploymentError("unsupported");
      return result;
    },
    async read(daemonId, target) {
      await pace();
      const text = (
        await fileContent().execute({
          params: params(daemonId),
          data: { target },
          forceRequest: true
        })
      ).value;
      if (typeof text !== "string") return deploymentError("unsupported");
      return text;
    },
    async write(daemonId, target, text) {
      await pace();
      await fileContent().execute({
        params: params(daemonId),
        data: { target, text },
        forceRequest: true
      });
    },
    async mkdir(daemonId, target) {
      await pace();
      await addFolder().execute({ params: params(daemonId), data: { target }, forceRequest: true });
    },
    async copy(daemonId, targets) {
      await pace();
      const result = (
        await copyFile().execute({
          params: params(daemonId),
          data: { targets },
          forceRequest: true
        })
      ).value;
      if (result !== true) deploymentError("backup");
    },
    async archive(daemonId, source, targets, extract) {
      await pace();
      const result = (
        await compressFile().execute({
          params: params(daemonId),
          data: { source, targets, type: extract ? 0 : 1, code: "utf-8" },
          forceRequest: true
        })
      ).value;
      if (result !== true) deploymentError("archive");
    },
    async upload(daemonId, directory, file) {
      await pace();
      const config = (
        await uploadAddress().execute({
          params: { ...params(daemonId), upload_dir: directory, file_name: file.name },
          forceRequest: true
        })
      ).value;
      if (!config) return deploymentError("unsupported");
      let notifyStart!: () => void;
      const started = new Promise<void>((resolve) => {
        notifyStart = resolve;
      });
      const task = uploadService.append(
        file,
        parseForwardAddress(getFileConfigAddr(config), "http"),
        config.password,
        { overwrite: false, unzip: false, code: "utf-8" },
        (upload) => {
          upload.instanceInfo = { daemonId, instanceId: GLOBAL_INSTANCE_UUID };
          upload.addCallback("start", notifyStart);
        }
      );
      return { completion: task.completion, started, stop: () => task.stop() };
    }
  };
}
