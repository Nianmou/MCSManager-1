import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { world, ensureUser, loginSessionRetry, requestPanel, waitFor, sleep } from "../lib";

const targets: { daemonId: string; instanceUuid: string }[] = [];
const session = () => ({ cookie: world.admin.cookie!, token: world.admin.token! });
async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve())); return port;
}
async function create(mode = "ack", rcon = true) {
  const port = await freePort(), cwd = path.join(world.workDir, `cs2-${targets.length}`);
  fs.mkdirSync(cwd, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "../fixtures/pam-rcon-server.mjs"), path.join(cwd, "server.mjs"));
  const result = await requestPanel({ method: "POST", path: "/instance", key: world.key,
    query: { daemonId: world.daemonId }, body: { nickname: `cs2-${mode}`, cwd,
      startCommand: `"${process.execPath}" server.mjs ${port} ${mode}`, stopCommand: "quit", stopTimeout: 3,
      enableRcon: rcon, rconIp: "127.0.0.1", rconPort: port, rconPassword: "fixture-secret",
      terminalOption: { pty: false }, ie: "utf-8", oe: "utf-8" } });
  expect(result.httpStatus, JSON.stringify(result.data)).toBe(200);
  const uuid = result.data.instanceUuid;
  const target = { daemonId: world.daemonId, instanceUuid: uuid }; targets.push(target);
  expect((await requestPanel({ method: "POST", path: "/instance/multi_open", key: world.key, body: [target] })).httpStatus).toBe(200);
  await waitFor(() => fs.existsSync(path.join(cwd, "starts.txt")), { timeout: 15000 });
  return { uuid, cwd, query: { daemonId: world.daemonId, uuid },
    starts: () => Number(fs.readFileSync(path.join(cwd, "starts.txt"), "utf8")),
    commands: () => fs.existsSync(path.join(cwd, "commands.log")) ? fs.readFileSync(path.join(cwd, "commands.log"), "utf8") : "" };
}
async function schedule(instance: Awaited<ReturnType<typeof create>>, seconds = 15) {
  const result = await requestPanel({ method: "POST", path: "/protected_schedule", ...session(), query: instance.query,
    body: { name: "notified-restart", count: 1, time: "3", type: 1,
      actions: [{ type: "restart_notice", payload: JSON.stringify({ seconds, message: "服务器即将重启" }) }] } });
  expect(result.data, JSON.stringify(result.raw)).toBe(true);
}
beforeAll(async () => {
  await ensureUser("admin", world.key, 0);
  await requestPanel({ method: "PUT", path: "/auth", key: world.key, body: { uuid: world.admin.uuid, config: { permission: 10 } } });
  await loginSessionRetry("admin"); await ensureUser("u1", world.key, 0);
});
afterAll(async () => {
  if (targets.length) await requestPanel({ method: "POST", path: "/instance/multi_stop", key: world.key, body: targets });
});
describe("CS2 observations and scheduled reminders over real RCON", () => {
  it("collects stdout-confirmed humans/loaded versions and enforces instance access", async () => {
    const instance = await create();
    const info = await waitFor(async () => {
      const result = await requestPanel({ method: "GET", path: "/instance", ...session(), query: instance.query });
      return result.data?.info?.cs2?.state === "available" ? result.data.info.cs2 : false;
    }, { timeout: 25000 });
    expect(info).toMatchObject({ players: 3, pluginVersion: "2.0.0.11", platformVersion: "1.5.0", addonsManager: { state: "loaded", version: "1.2.3" } });
    const denied = await requestPanel({ method: "GET", path: "/instance", cookie: world.u1.cookie,
      token: world.u1.token, query: instance.query });
    expect(denied.data?.info).toBeUndefined();
  });
  it.each([['old', 'unknown'], ['malformed', 'unknown'], ['absent', 'not_loaded']])("keeps existing telemetry for %s registry response", async (mode, state) => {
    const instance = await create(mode);
    const info = await waitFor(async () => {
      const result = await requestPanel({ method: "GET", path: "/instance", ...session(), query: instance.query });
      return result.data?.info?.cs2?.state === "available" ? result.data.info.cs2 : false;
    }, { timeout: 25000 });
    expect(info).toMatchObject({ players: 3, pluginVersion: "2.0.0.11", addonsManager: { state } });
  });
  it("sends the exact Workshop command to two same-node instances without lifecycle actions and denies unassigned users", async () => {
    const first = await create(), second = await create();
    const instances = [first, second];
    const pids = instances.map((instance) => fs.readFileSync(path.join(instance.cwd, "pid.txt"), "utf8"));
    const command = "sw_downloadaddon 3801682815";
    const denied = await requestPanel({ method: "POST", path: "/protected_instance/command", cookie: world.u1.cookie,
      token: world.u1.token, query: { ...first.query, command } });
    expect(denied.httpStatus).toBe(403);
    expect(first.commands()).not.toContain(command);
    for (const instance of instances) {
      const result = await requestPanel({ method: "POST", path: "/protected_instance/command", ...session(), query: { ...instance.query, command } });
      expect(result.httpStatus, JSON.stringify(result.data)).toBe(200);
      await waitFor(() => instance.commands().includes(command), { timeout: 10000 });
      expect(instance.commands().split('\n').filter((line) => line.endsWith(' ' + command))).toHaveLength(1);
      expect(instance.commands()).not.toMatch(/ (quit|exit)\n/);
      expect(instance.starts()).toBe(1);
    }
    expect(instances.map((instance) => fs.readFileSync(path.join(instance.cwd, "pid.txt"), "utf8"))).toEqual(pids);
  });
  it("waits for plugin confirmation and all 15 seconds before exactly one scheduled restart", async () => {
    const instance = await create(); await schedule(instance);
    const begin = await waitFor(() => instance.commands().split("\n").find((line) => line.includes("pam_restart_notice begin")), { timeout: 15000 });
    const beginAt = Number(begin.split(" ")[0]);
    await sleep(11000); expect(instance.starts()).toBe(1);
    await waitFor(() => instance.starts() === 2, { timeout: 18000 });
    const quitAt = Number(instance.commands().split("\n").find((line) => line.endsWith(" quit"))!.split(" ")[0]);
    expect(quitAt - beginAt).toBeGreaterThanOrEqual(15000);
    await sleep(3000); expect(instance.starts()).toBe(2);
  });
  it("skips unsupported plugins and missing RCON without any restart", async () => {
    const silent = await create("silent"), missing = await create("ack", false);
    await schedule(silent, 10); await schedule(missing, 10);
    await sleep(23000);
    expect(silent.starts()).toBe(1); expect(missing.starts()).toBe(1);
    expect(silent.commands()).toContain("pam_restart_notice begin");
    expect(missing.commands()).not.toContain("pam_restart_notice begin");
    expect(silent.commands()).not.toContain(" quit");
  });
  it("abandons a countdown after a manual stop and invalidates runtime observations", async () => {
    const instance = await create(); await schedule(instance, 10);
    await waitFor(() => instance.commands().includes("pam_restart_notice begin"), { timeout: 15000 });
    await requestPanel({ method: "POST", path: "/instance/multi_stop", key: world.key,
      body: [{ daemonId: world.daemonId, instanceUuid: instance.uuid }] });
    await sleep(13000); expect(instance.starts()).toBe(1);
    const result = await requestPanel({ method: "GET", path: "/instance", ...session(), query: instance.query });
    expect(result.data.info.cs2.state).toBe("unavailable");
  });
});
