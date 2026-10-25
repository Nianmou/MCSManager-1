// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { strToU8 } from "fflate";
import { normalizePackage } from "../package";
import {
  DeploymentRunner,
  instanceKey,
  prepareDeployment,
  refreshUnresolvedDeployments,
  type DeploymentTransport,
  type DeploymentInstance
} from "../workflow";

const root = "/game/csgo";
const entry = (path: string, text = "new") => ({ path, bytes: strToU8(text) });
const plugin = () => normalizePackage([entry("P.dll"), entry("config.json")], "plugin", "P");
function fixture() {
  const files = new Map<string, number>([
    [root + "/gameinfo.gi", 30],
    [root + "/addons/swiftlys2/plugins/P/P.dll", 1],
    [root + "/addons/swiftlys2/plugins/P/config.json", 10]
  ]);
  let loader = "SearchPaths\n{\n Game csgo\n}";
  const instances: DeploymentInstance[] = [
    { daemonId: "a", instanceUuid: "same", name: "selected", status: 0 },
    { daemonId: "a", instanceUuid: "sibling", name: "unselected", status: 0 },
    { daemonId: "b", instanceUuid: "same", name: "other node", status: 0 }
  ];
  const nodes = ["a", "b"].map((uuid) => ({ uuid, available: true, ip: uuid, remarks: uuid }));
  const directories = new Set([
    root,
    root + "/addons",
    root + "/addons/swiftlys2",
    root + "/addons/swiftlys2/plugins",
    root + "/addons/swiftlys2/plugins/P"
  ]);
  const transport: DeploymentTransport = {
    discover: vi.fn(async () => ({ nodes, instances })),
    status: vi.fn(async () => ({ platform: "linux", isGlobalInstance: true, instanceFileTask: 0 })),
    list: vi.fn(async (_node, path) => {
      if (!directories.has(path)) throw new Error("missing directory");
      return {
        absolutePath: path,
        items: [
          ...[...directories]
            .filter((dir) => dir.slice(0, dir.lastIndexOf("/")) === path)
            .map((dir) => ({ name: dir.slice(dir.lastIndexOf("/") + 1), type: 0, size: 0 })),
          ...[...files]
            .filter(([file]) => file.slice(0, file.lastIndexOf("/")) === path)
            .map(([file, size]) => ({ name: file.slice(file.lastIndexOf("/") + 1), type: 1, size }))
        ]
      };
    }),
    read: vi.fn(async () => loader),
    write: vi.fn(async (_node, _path, text) => {
      loader = text;
    }),
    mkdir: vi.fn(async (_node, path) => {
      directories.add(path);
    }),
    copy: vi.fn(async (_node, targets) => {
      for (const [source, dest] of targets) {
        files.set(dest, files.get(source)!);
        for (
          let dir = dest.slice(0, dest.lastIndexOf("/"));
          dir.startsWith(root);
          dir = dir.slice(0, dir.lastIndexOf("/"))
        )
          directories.add(dir);
      }
    }),
    archive: vi.fn(async (_node, source, _targets, extract) => {
      if (!extract) files.set(source, 100);
      else {
        for (const item of plugin().entries.filter((item) => !item.protected))
          files.set(root + "/" + item.path, item.bytes.length);
      }
    }),
    upload: vi.fn(async () => ({
      completion: Promise.resolve({ status: "success" as const }),
      stop: vi.fn(async () => {})
    }))
  };
  const prepare = async (pkg = plugin()) =>
    (await prepareDeployment(transport, pkg, ["a:same"], { a: root }))[0];
  return { transport, files, instances, nodes, prepare };
}
describe("deployment preflight and application", () => {
  it("executes only reviewed eligible targets and leaves blocked/successful results intact", async () => {
    const { transport, nodes, instances } = fixture();
    nodes.push({ uuid: "offline", available: false, ip: "offline", remarks: "offline" });
    instances[2].status = 3;
    const targets = await prepareDeployment(transport, plugin(), "all", { a: root, b: root });
    for (const target of targets) target.confirmed = true;
    await new DeploymentRunner(transport).applyBatch(targets, plugin());
    expect(targets[0].phase).toBe("success");
    expect(targets[1].running).toEqual(["other node"]);
    expect(targets[2].error).toMatchObject({ code: "offline" });
    expect(transport.upload).toHaveBeenCalledTimes(1);
    await new DeploymentRunner(transport).applyBatch(targets, plugin());
    expect(transport.upload).toHaveBeenCalledTimes(1);
  });
  it("refreshes only unresolved nodes, includes recovered coverage for review, and clears confirmation", async () => {
    const { transport, nodes, instances } = fixture();
    nodes[1].available = false;
    const targets = await prepareDeployment(transport, plugin(), "all", { a: root, b: root });
    targets[0].phase = "success";
    nodes[1].available = true;
    nodes.push({ uuid: "outside-batch", available: true, ip: "outside", remarks: "outside" });
    instances.push({ daemonId: "b", instanceUuid: "recovered", name: "recovered", status: 0 });
    const result = await refreshUnresolvedDeployments(transport, plugin(), targets);
    expect(result[0]).toBe(targets[0]);
    expect(result.map((target) => target.daemonId)).toEqual(["a", "b"]);
    expect(result[1].phase).toBe("ready");
    expect(result[1].affected.map((row) => row.instanceUuid)).toEqual(["same", "recovered"]);
    expect(result[1].confirmed).toBe(false);
    await new DeploymentRunner(transport).applyBatch(result, plugin());
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it("plans all discovered instances once per node, from a single fresh inventory", async () => {
    const { transport, instances } = fixture();
    instances.push({ daemonId: "b", instanceUuid: "new-page", name: "another page", status: 0 });
    const targets = await prepareDeployment(transport, plugin(), "all", { a: root, b: root });
    expect(transport.discover).toHaveBeenCalledTimes(1);
    expect(targets).toHaveLength(2);
    expect(targets.flatMap((target) => target.affected)).toHaveLength(4);
    instances[0].name = "renamed after preview";
    instances.push({ daemonId: "a", instanceUuid: "later", name: "later", status: 0 });
    expect(targets[0].affected[0].name).toBe("selected");
    expect(targets[0].affected).toHaveLength(2);
    const selected = await prepareDeployment(transport, plugin(), ["b:same"], { b: root });
    expect(selected.map((target) => target.daemonId)).toEqual(["b"]);
  });
  it("keeps unknown nodes visible and blocks incomplete inventory before file preflight", async () => {
    const { transport, nodes, instances } = fixture();
    nodes.push({ uuid: "offline", available: false, ip: "offline", remarks: "offline" });
    vi.mocked(transport.discover).mockResolvedValue({
      nodes,
      instances,
      issues: { a: "inventory", offline: "offline" }
    });
    const targets = await prepareDeployment(transport, plugin(), "all", { a: root, b: root });
    expect(targets.map((target) => [target.daemonId, target.phase])).toEqual([
      ["a", "failed"],
      ["b", "ready"],
      ["offline", "failed"]
    ]);
    expect(transport.status).toHaveBeenCalledTimes(1);
    expect(transport.status).toHaveBeenCalledWith("b");
  });
  it("rejects an empty fleet and uses an explicitly supplied preview snapshot without rediscovery", async () => {
    const { transport, nodes, instances } = fixture();
    const targets = await prepareDeployment(
      transport,
      plugin(),
      "all",
      { a: root, b: root },
      false,
      { nodes, instances }
    );
    expect(targets).toHaveLength(2);
    expect(transport.discover).not.toHaveBeenCalled();
    await expect(
      prepareDeployment(transport, plugin(), "all", {}, false, { nodes: [], instances: [] })
    ).rejects.toMatchObject({ code: "targets" });
  });
  it("requires a new preview when affected instance identities change", async () => {
    const { transport, instances, prepare } = fixture();
    const target = await prepare();
    target.confirmed = true;
    instances.push({ daemonId: "a", instanceUuid: "later", name: "new sibling", status: 0 });
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.error).toMatchObject({ code: "changed" });
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it("uses composite instance IDs, deduplicates a shared node, includes unselected siblings", async () => {
    const { transport } = fixture();
    const targets = await prepareDeployment(
      transport,
      plugin(),
      ["a:same", "a:sibling", "b:same"],
      { a: root, b: root }
    );
    expect(targets).toHaveLength(2);
    expect(targets[0].affected.map(instanceKey)).toEqual(["a:same", "a:sibling"]);
    expect(targets[1].affected.map(instanceKey)).toEqual(["b:same"]);
    expect(targets[0].files.map((file) => file.write)).toEqual([true, false]);
  });
  it("blocks a running unselected sibling without changing files", async () => {
    const { transport, instances, prepare } = fixture();
    instances[1].status = 3;
    const target = await prepare();
    target.confirmed = true;
    expect(target.running).toEqual(["unselected"]);
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("failed");
    expect(transport.upload).not.toHaveBeenCalled();
    expect(transport.archive).not.toHaveBeenCalled();
  });
  it("reports legacy context errors and offline nodes during read-only preflight", async () => {
    const { transport, prepare, nodes } = fixture();
    vi.mocked(transport.status).mockRejectedValueOnce(new Error("unsupported"));
    expect((await prepare()).phase).toBe("failed");
    nodes[0].available = false;
    expect((await prepare()).phase).toBe("failed");
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it("blocks writes if a fresh inventory omits a sibling on an incomplete node", async () => {
    const { transport, prepare, nodes, instances } = fixture();
    const target = await prepare();
    target.confirmed = true;
    vi.mocked(transport.discover).mockResolvedValue({
      nodes,
      instances: [instances[0]],
      issues: { a: "inventory" }
    });
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("failed");
    expect(target.error).toMatchObject({ code: "inventory" });
    expect(transport.copy).not.toHaveBeenCalled();
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it("backs up replacements, preserves config, verifies extraction, and never edits plugin loader", async () => {
    const { transport, prepare, files } = fixture();
    const target = await prepare();
    target.confirmed = true;
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("success");
    expect(target.backup).toContain(".mcsm-deploy-backups/");
    expect(transport.archive).toHaveBeenNthCalledWith(
      1,
      "a",
      target.backup,
      [target.backup!.replace(/\.zip$/, "")],
      false
    );
    expect(transport.copy).toHaveBeenCalledWith("a", [
      [
        root + "/addons/swiftlys2/plugins/P/P.dll",
        expect.stringContaining("/addons/swiftlys2/plugins/P/P.dll")
      ]
    ]);
    expect(files.get(root + "/addons/swiftlys2/plugins/P/config.json")).toBe(10);
    expect(transport.write).not.toHaveBeenCalled();
  });
  it("supports explicit protected replacement in the preview", async () => {
    const { transport } = fixture();
    const [target] = await prepareDeployment(transport, plugin(), ["a:same"], { a: root }, true);
    expect(target.files.every((file) => file.write)).toBe(true);
  });
  it("honors reviewed no-backup policy without relaxing protected-file preservation", async () => {
    const { transport, files } = fixture();
    const [target] = await prepareDeployment(transport, plugin(), ["a:same"], { a: root }, false, undefined, false);
    expect(target.backupBeforeDeploy).toBe(false);
    target.confirmed = true;
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("success");
    expect(target.backup).toBeUndefined();
    expect(transport.copy).not.toHaveBeenCalled();
    expect(transport.mkdir).not.toHaveBeenCalled();
    expect(transport.archive).toHaveBeenCalledOnce();
    expect(vi.mocked(transport.archive).mock.calls[0][3]).toBe(true);
    expect(files.get(root + "/addons/swiftlys2/plugins/P/config.json")).toBe(10);
  });
  it("preserves no-backup policy when retrying unresolved destinations", async () => {
    const { transport } = fixture();
    const targets = await prepareDeployment(transport, plugin(), ["a:same"], { a: root }, false, undefined, false);
    targets[0].phase = "failed";
    const refreshed = await refreshUnresolvedDeployments(transport, plugin(), targets);
    expect(refreshed[0].backupBeforeDeploy).toBe(false);
    expect(refreshed[0].confirmed).toBe(false);
  });
  it("does not upload after an unverifiable backup", async () => {
    const { transport, prepare } = fixture();
    vi.mocked(transport.archive).mockResolvedValue(undefined);
    const target = await prepare();
    target.confirmed = true;
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("failed");
    expect(transport.upload).not.toHaveBeenCalled();
  });
  it.each(["extract", "verify", "transfer"])(
    "retains recovery location when %s fails",
    async (step) => {
      const { transport, prepare, files } = fixture();
      const archive = transport.archive;
      transport.archive = vi.fn(async (...args) => {
        if (args[3] && step === "extract") throw new Error("extract failed");
        await archive(...args);
        if (args[3] && step === "verify") files.delete(root + "/addons/swiftlys2/plugins/P/P.dll");
      });
      if (step === "transfer")
        vi.mocked(transport.upload).mockResolvedValue({
          completion: Promise.resolve({ status: "failed" }),
          stop: vi.fn(async () => {})
        });
      const target = await prepare();
      target.confirmed = true;
      await new DeploymentRunner(transport).apply(target, plugin());
      expect(target.phase).toBe("failed");
      expect(target.backup).toBeTruthy();
      expect(transport.write).not.toHaveBeenCalled();
    }
  );
  it("can retry a failed target after fresh preflight", async () => {
    const { transport, prepare } = fixture();
    vi.mocked(transport.upload).mockRejectedValueOnce(new Error("network"));
    const target = await prepare();
    target.confirmed = true;
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("failed");
    await new DeploymentRunner(transport).apply(target, plugin());
    expect(target.phase).toBe("success");
  });
  it("cancels before application without a write", async () => {
    const { transport, prepare } = fixture();
    const target = await prepare();
    target.confirmed = true;
    const runner = new DeploymentRunner(transport);
    await runner.cancel();
    await runner.apply(target, plugin());
    expect(target.phase).toBe("canceled");
    expect(transport.archive).not.toHaveBeenCalled();
  });
  it("times out queued transfers without extraction or false success", async () => {
    const { transport, prepare } = fixture();
    const target = await prepare();
    target.confirmed = true;
    vi.mocked(transport.upload).mockResolvedValue({
      completion: new Promise(() => {}),
      stop: vi.fn(async () => {})
    });
    vi.useFakeTimers();
    try {
      const run = new DeploymentRunner(transport).apply(target, plugin());
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1);
      await run;
      expect(target.phase).toBe("failed");
      expect(transport.archive).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([true, false])("registers the platform loader with backup policy %s after binary verification", async (backupBeforeDeploy) => {
    const { transport, files } = fixture();
    const pkg = normalizePackage([entry("addons/swiftlys2/bin/runtime.so")], "platform", "");
    const archive = transport.archive;
    transport.archive = vi.fn(async (...args) => {
      await archive(...args);
      if (args[3]) {
        files.set(root + "/addons/swiftlys2/bin/runtime.so", 3);
      }
    });
    // The extracted binary's parent exists when the verification listing runs.
    const list = transport.list;
    transport.list = vi.fn(async (node, path) => {
      if (path === root + "/addons/swiftlys2/bin")
        return { absolutePath: path, items: [{ name: "runtime.so", type: 1, size: 3 }] };
      const result = await list(node, path);
      if (
        path === root + "/addons/swiftlys2" &&
        files.has(root + "/addons/swiftlys2/bin/runtime.so")
      )
        result.items.push({ name: "bin", type: 0, size: 0 });
      return result;
    });
    const target = (await prepareDeployment(transport, pkg, ["a:same"], { a: root }, false, undefined, backupBeforeDeploy))[0];
    target.confirmed = true;
    await new DeploymentRunner(transport).apply(target, pkg);
    expect(target.phase).toBe("success");
    expect(transport.write).toHaveBeenCalledWith(
      "a",
      root + "/gameinfo.gi",
      expect.stringContaining("csgo/addons/swiftlys2")
    );
    if (backupBeforeDeploy) {
      expect(target.backup).toBeTruthy();
      expect(transport.copy).toHaveBeenCalled();
    } else {
      expect(target.backup).toBeUndefined();
      expect(transport.copy).not.toHaveBeenCalled();
      expect(transport.mkdir).not.toHaveBeenCalled();
      expect(vi.mocked(transport.archive).mock.calls.every((call) => call[3])).toBe(true);
    }
  });
});
