import { zipSync } from "fflate";
import { v4 as uuidv4 } from "uuid";
import type { NodeStatus } from "@/types";
import type { UploadResult } from "@/services/uploadService";
import {
  assertPackagePlatform,
  deploymentError,
  patchGameInfo,
  type DeploymentPackage,
  type PackageEntry
} from "./package";

export interface DeploymentInstance {
  daemonId: string;
  instanceUuid: string;
  name: string;
  status: number;
  cwd?: string;
  command?: string;
}
export interface FileItem {
  name: string;
  size: number;
  type: number;
  mode?: number;
}
export interface Directory {
  items: FileItem[];
  absolutePath: string;
}
export interface DeploymentDiscovery {
  nodes: Pick<NodeStatus, "uuid" | "available" | "remarks" | "ip">[];
  instances: DeploymentInstance[];
  issues?: Record<string, "offline" | "inventory">;
}
export interface DeploymentTransport {
  discover(): Promise<DeploymentDiscovery>;
  list(node: string, path: string): Promise<Directory>;
  status(
    node: string
  ): Promise<{ platform: string; isGlobalInstance: boolean; instanceFileTask: number }>;
  read(node: string, path: string): Promise<string>;
  write(node: string, path: string, text: string): Promise<void>;
  mkdir(node: string, path: string): Promise<void>;
  copy(node: string, targets: string[][]): Promise<void>;
  archive(
    node: string,
    source: string,
    targets: string[] | string,
    extract: boolean
  ): Promise<void>;
  upload(
    node: string,
    directory: string,
    file: File
  ): Promise<{ completion: Promise<UploadResult>; started?: Promise<void>; stop(): Promise<void> }>;
}
export type DeploymentPhase =
  | "ready"
  | "backup"
  | "queued"
  | "transferring"
  | "extracting"
  | "verifying"
  | "success"
  | "failed"
  | "canceled";
export const SHARED_GAME_ROOT = "/mnt/steam/cs2/game/csgo";
export interface PlannedFile {
  entry: PackageEntry;
  existing?: FileItem;
  write: boolean;
}
export interface DeploymentTarget {
  key: string;
  daemonId: string;
  nodeName: string;
  root: string;
  affected: DeploymentInstance[];
  files: PlannedFile[];
  phase: DeploymentPhase;
  error?: unknown;
  backup?: string;
  backupBeforeDeploy?: boolean;
  loaderOriginal?: string;
  loaderPatched?: string;
  running: string[];
  confirmed: boolean;
}
export type DeploymentScope = "all" | string[] | { nodes: string[] };
export const instanceKey = (instance: Pick<DeploymentInstance, "daemonId" | "instanceUuid">) =>
  `${instance.daemonId}:${instance.instanceUuid}`;
export function absoluteDirectory(input: string): string {
  const path = input.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (
    !/^(?:\/(?!\/)|[A-Za-z]:\/)/.test(path) ||
    /[\x00-\x1f]/.test(path) ||
    path.split("/").some((part) => part === ".." || part === ".") ||
    path.length < 4
  )
    return deploymentError("directory", input);
  return path;
}
const dirname = (path: string) => path.slice(0, path.lastIndexOf("/"));
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// Parent listings distinguish genuinely missing directories from authorization/network errors.
async function fileLookup(transport: DeploymentTransport, node: string, root: string) {
  const cache = new Map<string, Directory | undefined>();
  cache.set(root, await transport.list(node, root));
  async function directory(path: string): Promise<Directory | undefined> {
    if (cache.has(path)) return cache.get(path);
    const parent = await directory(dirname(path));
    const entry = parent?.items.find((item) => item.name === basename(path));
    if (entry && entry.type !== 0) return deploymentError("directory", path);
    const result = entry ? await transport.list(node, path) : undefined;
    cache.set(path, result);
    return result;
  }
  return async (path: string) =>
    (await directory(dirname(path)))?.items.find((item) => item.name === basename(path));
}

export async function prepareDeployment(
  transport: DeploymentTransport,
  pkg: DeploymentPackage,
  scope: DeploymentScope,
  roots: Record<string, string>,
  replaceProtected = false,
  snapshot?: DeploymentDiscovery,
  backupBeforeDeploy = true
) {
  const discovery = snapshot || (await transport.discover());
  const selected = new Set(Array.isArray(scope) ? scope : []);
  const selectedInstances = discovery.instances.filter((instance) =>
    selected.has(instanceKey(instance))
  );
  if (Array.isArray(scope) && (!selected.size || selectedInstances.length !== selected.size))
    return deploymentError("targets");
  const nodeIds = typeof scope === "object" && !Array.isArray(scope) ? scope.nodes : undefined;
  const nodes = discovery.nodes.filter((node) =>
    nodeIds
      ? nodeIds.includes(node.uuid)
      : scope === "all"
      ? discovery.instances.some((instance) => instance.daemonId === node.uuid) ||
        !node.available ||
        !!discovery.issues?.[node.uuid]
      : selectedInstances.some((instance) => instance.daemonId === node.uuid)
  );
  for (const id of nodeIds || [])
    if (!nodes.some((node) => node.uuid === id))
      nodes.push({ uuid: id, available: false, ip: id, remarks: id });
  if (!nodes.length) return deploymentError("targets");
  const targets: DeploymentTarget[] = [];
  for (const node of nodes) {
    const target: DeploymentTarget = {
      key: node.uuid,
      daemonId: node.uuid,
      nodeName: node.remarks || node.ip,
      root: roots[node.uuid] || "",
      affected: discovery.instances
        .filter((instance) => instance.daemonId === node.uuid)
        .map((instance) => ({ ...instance })),
      files: [],
      phase: "ready",
      running: [],
      confirmed: false,
      backupBeforeDeploy
    };
    targets.push(target);
    try {
      if (!node.available) deploymentError("offline");
      if (discovery.issues?.[node.uuid]) deploymentError("inventory");
      if (!target.affected.length) deploymentError("targets");
      const root = absoluteDirectory(target.root);
      const status = await transport.status(node.uuid);
      if (!status.isGlobalInstance || status.instanceFileTask) deploymentError("busy");
      assertPackagePlatform(pkg, status.platform);
      target.root = absoluteDirectory((await transport.list(node.uuid, root)).absolutePath);
      target.key = `${node.uuid}:${
        status.platform === "win32" ? target.root.toLowerCase() : target.root
      }`;
      const lookup = await fileLookup(transport, node.uuid, target.root);
      target.loaderOriginal = await transport.read(node.uuid, target.root + "/gameinfo.gi");
      if (pkg.mode === "platform") target.loaderPatched = patchGameInfo(target.loaderOriginal);
      else {
        const runtime = await lookup(target.root + "/addons/swiftlys2");
        if (!runtime || runtime.type !== 0) deploymentError("runtime");
      }
      for (const entry of pkg.entries) {
        const existing = await lookup(target.root + "/" + entry.path);
        if (existing?.type === 0) deploymentError("directory", entry.path);
        target.files.push({
          entry,
          existing,
          write: !existing || !entry.protected || replaceProtected
        });
      }
      target.running = target.affected
        .filter((instance) => instance.status !== 0)
        .map((instance) => instance.name);
    } catch (error) {
      target.phase = "failed";
      target.error = error;
    }
  }
  return targets;
}

export const eligibleDeploymentTarget = (target: DeploymentTarget) =>
  target.phase === "ready" && !target.error && !target.running.length;

export async function refreshUnresolvedDeployments(
  transport: DeploymentTransport,
  pkg: DeploymentPackage,
  targets: DeploymentTarget[],
  replaceProtected = false,
  backupBeforeDeploy = targets[0]?.backupBeforeDeploy !== false
) {
  const unresolved = targets.filter((target) => target.phase !== "success");
  if (!unresolved.length) return targets;
  const refreshed = await prepareDeployment(
    transport,
    pkg,
    { nodes: unresolved.map((target) => target.daemonId) },
    Object.fromEntries(unresolved.map((target) => [target.daemonId, target.root])),
    replaceProtected,
    undefined,
    backupBeforeDeploy
  );
  return targets.map((old) =>
    old.phase === "success" ? old : refreshed.find((target) => target.daemonId === old.daemonId)!
  );
}

export class DeploymentRunner {
  canceled = false;
  private activeUpload?: { stop(): Promise<void> };
  constructor(private transport: DeploymentTransport) {}
  async cancel() {
    this.canceled = true;
    await this.activeUpload?.stop();
  }
  private checkCanceled() {
    if (this.canceled) deploymentError("canceled");
  }
  async applyBatch(targets: DeploymentTarget[], pkg: DeploymentPackage) {
    for (const target of targets) {
      if (!eligibleDeploymentTarget(target) || !target.confirmed) continue;
      if (this.canceled) target.phase = "canceled";
      else await this.apply(target, pkg);
    }
  }
  private async stopped(target: DeploymentTarget) {
    this.checkCanceled();
    const current = await this.transport.discover();
    const node = current.nodes.find((node) => node.uuid === target.daemonId);
    if (!node?.available) deploymentError("offline");
    if (current.issues?.[target.daemonId]) deploymentError("inventory");
    // Conservatively include every node sibling: launch scripts may hide shared paths.
    const siblings = current.instances.filter((instance) => instance.daemonId === target.daemonId);
    const running = siblings.filter((instance) => instance.status !== 0);
    if (running.length)
      deploymentError("running", running.map((instance) => instance.name).join(", "));
    if (!target.confirmed) deploymentError("confirm");
    const previous = new Set(target.affected.map(instanceKey));
    if (
      siblings.length !== previous.size ||
      siblings.some((instance) => !previous.has(instanceKey(instance)))
    )
      deploymentError("changed");
    return current;
  }
  async apply(target: DeploymentTarget, pkg: DeploymentPackage) {
    target.error = undefined;
    try {
      const current = await this.stopped(target);
      // Rebuild the plan to account for changes since preview and before retries.
      const replaceProtected = target.files.some(
        (file) => file.entry.protected && file.existing && file.write
      );
      const [fresh] = await prepareDeployment(
        this.transport,
        pkg,
        target.affected.map(instanceKey),
        { [target.daemonId]: target.root },
        replaceProtected,
        current,
        target.backupBeforeDeploy !== false
      );
      if (!fresh || fresh.error) throw fresh?.error || deploymentError("changed");
      if (fresh.key !== target.key) deploymentError("changed");
      const expected = target.files
        .filter((file) => file.write)
        .map((file) => file.entry.path)
        .sort()
        .join("\n");
      if (
        fresh.files
          .filter((file) => file.write)
          .map((file) => file.entry.path)
          .sort()
          .join("\n") !== expected
      )
        deploymentError("changed");
      target.files = fresh.files;
      target.loaderOriginal = fresh.loaderOriginal;
      target.loaderPatched = fresh.loaderPatched;
      const writing = target.files.filter((file) => file.write);
      if (!writing.length) deploymentError("package");
      const id = uuidv4();
      const overwritten = writing
        .filter((file) => file.existing)
        .map((file) => target.root + "/" + file.entry.path);
      if (target.loaderPatched !== undefined && target.loaderOriginal !== target.loaderPatched)
        overwritten.push(target.root + "/gameinfo.gi");
      target.backup = undefined;
      if (overwritten.length && target.backupBeforeDeploy !== false) {
        target.phase = "backup";
        const directory = target.root + "/.mcsm-deploy-backups";
        await this.transport.mkdir(target.daemonId, directory);
        const backup = directory + "/" + id + ".zip";
        // Legacy compressors reduce each input to its basename and use the ZIP
        // directory as cwd. Stage a tree beside the ZIP so nested paths survive.
        const stagedRoot = directory + "/" + id;
        await this.transport.mkdir(target.daemonId, stagedRoot);
        const copies = overwritten.map((source) => [
          source,
          stagedRoot + source.slice(target.root.length)
        ]);
        await this.transport.copy(target.daemonId, copies);
        for (const [source, staged] of copies) {
          this.checkCanceled();
          const original = (await this.transport.list(target.daemonId, dirname(source))).items.find(
            (item) => item.name === basename(source)
          );
          const copied = (await this.transport.list(target.daemonId, dirname(staged))).items.find(
            (item) => item.name === basename(staged)
          );
          if (!original || !copied || copied.size !== original.size || copied.type !== 1)
            deploymentError("backup");
        }
        await this.transport.archive(target.daemonId, backup, [stagedRoot], false);
        const listing = await this.transport.list(target.daemonId, directory);
        if (!listing.items.some((item) => item.name === basename(backup) && item.size > 0))
          deploymentError("backup");
        target.backup = backup;
      }
      await this.stopped(target);
      const data = Object.fromEntries(writing.map((file) => [file.entry.path, file.entry.bytes]));
      const archive = new File([zipSync(data) as BlobPart], `mcsm-deploy-${id}.zip`, {
        type: "application/zip"
      });
      target.phase = "queued";
      const upload = await this.transport.upload(target.daemonId, target.root, archive);
      this.activeUpload = upload;
      if (this.canceled) {
        await upload.stop();
        this.checkCanceled();
      }
      if (upload.started)
        void upload.started.then(() => {
          if (target.phase === "queued") target.phase = "transferring";
        });
      else target.phase = "transferring";
      const result = await Promise.race([
        upload.completion,
        new Promise<UploadResult>((resolve) => {
          this.transferTimer = setTimeout(
            () => resolve({ status: "failed", error: "timeout" }),
            15 * 60 * 1000
          );
        })
      ]);
      clearTimeout(this.transferTimer);
      if (result.status !== "success") {
        await upload.stop();
        deploymentError(result.status === "canceled" ? "canceled" : "transfer", result.error);
      }
      this.activeUpload = undefined;
      await this.stopped(target);
      target.phase = "extracting";
      await this.transport.archive(
        target.daemonId,
        target.root + "/" + archive.name,
        target.root,
        true
      );
      this.checkCanceled();
      target.phase = "verifying";
      const lookup = await fileLookup(this.transport, target.daemonId, target.root);
      for (const file of writing) {
        const actual = await lookup(target.root + "/" + file.entry.path);
        if (!actual || actual.type !== 1 || actual.size !== file.entry.bytes.length)
          deploymentError("verify", file.entry.path);
      }
      if (target.loaderPatched !== undefined && target.loaderPatched !== target.loaderOriginal) {
        await this.stopped(target);
        if (
          (await this.transport.read(target.daemonId, target.root + "/gameinfo.gi")) !==
          target.loaderOriginal
        )
          deploymentError("changed");
        await this.transport.write(
          target.daemonId,
          target.root + "/gameinfo.gi",
          target.loaderPatched
        );
        if (
          (await this.transport.read(target.daemonId, target.root + "/gameinfo.gi")) !==
          target.loaderPatched
        )
          deploymentError("loader");
      }
      this.checkCanceled();
      target.phase = "success";
    } catch (error) {
      clearTimeout(this.transferTimer);
      target.error = error;
      target.phase =
        this.canceled || (error instanceof Error && "code" in error && error.code === "canceled")
          ? "canceled"
          : "failed";
    } finally {
      this.activeUpload = undefined;
    }
  }
  private transferTimer?: ReturnType<typeof setTimeout>;
}
