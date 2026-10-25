import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { DeploymentRunner, prepareDeployment, type DeploymentTransport } from "../../../../frontend/src/widgets/instance/deployment/workflow";
import { normalizePackage, patchGameInfo } from "../../../../frontend/src/widgets/instance/deployment/package";
import { world, ensureUser, loginSessionRetry, requestPanel, saveState, setDataPlane, getUploadPassport, uploadFileChunked } from "../lib";

// Exercise the actual browser deployment planner/runner against real panel and
// daemon processes. Fixtures stay in the isolated integration workspace; no game
// process is started and no production instance is touched.
const globalUuid = "global0001";
const admin = () => ({ cookie: world.admin.cookie!, token: world.admin.token! });
async function call(method: "GET" | "POST" | "PUT", endpoint: string, body?: any, query: Record<string, any> = {}) {
  await new Promise((resolve) => setTimeout(resolve, 160));
  const response = await axios({ method, url: `${world.panelUrl}/api${endpoint}`, data: body,
    params: { daemonId: world.daemonId, uuid: globalUuid, ...query, token: admin().token },
    headers: { Cookie: admin().cookie, "x-requested-with": "XMLHttpRequest" },
    timeout: 120000, validateStatus: () => true });
  if (response.status !== 200 || response.data.status !== 200) throw new Error(`File API failed ${endpoint}: ${JSON.stringify(response.data)}`);
  return response.data.data;
}
const transport: DeploymentTransport = {
  async discover() {
    const nodes = await call("GET", "/service/remote_services_list");
    const listing = await call("GET", "/service/remote_services_instances_global", undefined, { page: 1, page_size: 50 });
    const instances = Object.entries(listing).flatMap(([daemonId, entry]: [string, any]) => entry.instances.map((instance: any) => ({
      daemonId, instanceUuid: instance.instanceUuid, name: instance.config.nickname, status: instance.status
    })));
    return { nodes, instances };
  },
  async list(_node, target) {
    const items = []; let absolutePath = "";
    for (let page = 0; ; page++) {
      const result = await call("GET", "/files/list", undefined, { target, page, page_size: 100, file_name: "" });
      items.push(...result.items); absolutePath = result.absolutePath;
      if (items.length >= result.total) break;
    }
    return { items, absolutePath };
  },
  status: () => call("GET", "/files/status"),
  read: (_node, target) => call("PUT", "/files", { target }),
  async write(_node, target, text) { await call("PUT", "/files", { target, text }); },
  async mkdir(_node, target) { await call("POST", "/files/mkdir", { target }); },
  async copy(_node, targets) { expect(await call("POST", "/files/copy", { targets })).toBe(true); },
  async archive(_node, source, targets, extract) {
    expect(await call("POST", "/files/compress", { type: extract ? 0 : 1, source, targets, code: "utf-8" })).toBe(true);
  },
  async upload(node, directory, file) {
    const passport = await getUploadPassport(node, globalUuid, admin().cookie, admin().token, directory);
    expect(passport.password).toBeTruthy();
    const port = new URL(world.panelUrl).port;
    expect(passport.addr.includes(port)).toBe(currentMode === "proxy");
    const completion = (async () => {
      await uploadFileChunked({ addr: passport.addr, password: passport.password, name: file.name,
        content: Buffer.from(await file.arrayBuffer()), overwrite: false, unzip: false });
      return { status: "success" as const };
    })();
    return { completion, stop: async () => {} };
  }
};
let currentMode = "direct";
beforeAll(async () => {
  await ensureUser("admin", world.key, 0);
  const promote = await requestPanel({ method: "PUT", path: "/auth", key: world.key,
    body: { uuid: world.admin.uuid, config: { permission: 10 } } });
  expect(promote.httpStatus).toBe(200);
  await loginSessionRetry("admin");
  await ensureUser("u1", world.key, 0);
  const created = await requestPanel({ method: "POST", path: "/instance", key: world.key, query: { daemonId: world.daemonId },
    body: { nickname: "stopped deployment fixture", startCommand: "node never-started.js", stopCommand: "exit", cwd: "", ie: "utf-8", oe: "utf-8" } });
  expect(created.httpStatus).toBe(200); world.instance.uuid = created.data.instanceUuid; saveState();
});
describe("administrator CS2 deployment file operations", () => {
  it("denies global-node listing and upload credentials to regular and anonymous users", async () => {
    for (const session of [{ cookie: world.u1.cookie, token: world.u1.token }, {}]) {
      for (const [method, endpoint] of [["GET", "/files/list"], ["POST", "/files/upload"]] as const) {
        const result = await requestPanel({ method, path: endpoint, ...session,
          query: { daemonId: world.daemonId, uuid: globalUuid, target: ".", page: 0, page_size: 100, upload_dir: "." } });
        expect(result.httpStatus).not.toBe(200);
        expect(result.data?.password).toBeUndefined();
      }
    }
  });
  for (const mode of ["direct", "proxy"] as const) {
    it(`${mode}: platform and plugin deployment finalize extraction, preserve config, verify backups and loader`, async () => {
      currentMode = mode; await setDataPlane(mode);
      const directory = path.join(world.workDir, `cs2-deployment-${mode}`, "game", "csgo");
      const runtime = path.join(directory, "addons", "swiftlys2");
      fs.mkdirSync(path.join(runtime, "configs"), { recursive: true });
      const binary = process.platform === "win32" ? "runtime.dll" : "runtime.so";
      fs.mkdirSync(path.join(runtime, "bin"), { recursive: true });
      fs.writeFileSync(path.join(runtime, "bin", binary), "old-platform");
      fs.writeFileSync(path.join(runtime, "configs", "core.json"), '{"keep":true}');
      const gameinfo = "SearchPaths\n{\n Game csgo/addons/metamod\n Game csgo\n}\n";
      fs.writeFileSync(path.join(directory, "gameinfo.gi"), gameinfo);
      const bytes = (text: string) => new TextEncoder().encode(text);
      const pkg = normalizePackage([
        { path: `game/csgo/addons/swiftlys2/bin/${binary}`, bytes: bytes("new-platform") },
        { path: "game/csgo/addons/swiftlys2/configs/core.json", bytes: bytes('{"keep":false}') }
      ], "platform", "");
      const selected = [`${world.daemonId}:${world.instance.uuid}`];
      const roots = { [world.daemonId]: directory };
      const [target] = await prepareDeployment(transport, pkg, selected, roots);
      expect(target.error).toBeUndefined(); expect(target.running).toEqual([]); target.confirmed = true;
      await new DeploymentRunner(transport).apply(target, pkg);
      expect(target.phase, String(target.error)).toBe("success");
      expect(fs.statSync(target.backup!).size).toBeGreaterThan(0);
      expect(fs.readFileSync(path.join(runtime, "configs", "core.json"), "utf8")).toBe('{"keep":true}');
      expect(fs.readFileSync(path.join(runtime, "bin", binary), "utf8")).toBe("new-platform");
      expect(fs.readFileSync(path.join(directory, "gameinfo.gi"), "utf8")).toBe(patchGameInfo(gameinfo));
      const pluginRoot = path.join(runtime, "plugins", "PreAimMode");
      fs.mkdirSync(pluginRoot, { recursive: true });
      fs.writeFileSync(path.join(pluginRoot, "PreAimMode.dll"), "old-plugin");
      fs.writeFileSync(path.join(pluginRoot, "settings.json"), "preserve me");
      const plugin = normalizePackage([
        { path: "PreAimMode/PreAimMode.dll", bytes: bytes("new-plugin-binary") },
        { path: "PreAimMode/settings.json", bytes: bytes("default") }
      ], "plugin", "PreAimMode");
      const [pluginTarget] = await prepareDeployment(transport, plugin, selected, roots);
      expect(pluginTarget.error).toBeUndefined(); pluginTarget.confirmed = true;
      await new DeploymentRunner(transport).apply(pluginTarget, plugin);
      expect(pluginTarget.phase, String(pluginTarget.error)).toBe("success");
      expect(fs.readFileSync(path.join(pluginRoot, "PreAimMode.dll"), "utf8")).toBe("new-plugin-binary");
      expect(fs.readFileSync(path.join(pluginRoot, "settings.json"), "utf8")).toBe("preserve me");
      expect(fs.existsSync(path.join(pluginRoot, "PreAimMode", "PreAimMode.dll"))).toBe(false);
      expect(fs.readFileSync(path.join(directory, "gameinfo.gi"), "utf8")).toBe(patchGameInfo(gameinfo));
      expect((await transport.discover()).instances.every((instance) => instance.status === 0)).toBe(true);
    });
  }
});
