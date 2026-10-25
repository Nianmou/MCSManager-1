import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { world, ensureUser, loginSessionRetry, requestPanel, waitFor, sleep, saveState, REPO } from "../lib";
import { spawnApp, groupKill } from "../lib/process";

const root = "/instance/restart_notice";
const instances: string[] = [];
const jobs: string[] = [];
let recoveredPanel: ChildProcess | undefined;
const admin = () => ({ cookie: world.admin.cookie!, token: world.admin.token! });
const targets = (uuid: string) => [{ daemonId: world.daemonId, instanceUuid: uuid }];
async function createFixture(mode = "ack") {
  const cwd = path.join(world.workDir, `notice-${instances.length}`);
  fs.mkdirSync(cwd, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "../fixtures/restart-notice-server.mjs"), path.join(cwd, "server.mjs"));
  const created = await requestPanel({ method: "POST", path: "/instance", key: world.key,
    query: { daemonId: world.daemonId }, body: { nickname: `notice-${mode}`, cwd,
      startCommand: `"${process.execPath}" server.mjs ${mode}`, stopCommand: "exit", ie: "utf-8", oe: "utf-8" } });
  expect(created.httpStatus, JSON.stringify(created.data)).toBe(200);
  const uuid = created.data.instanceUuid; instances.push(uuid);
  const started = await requestPanel({ method: "POST", path: "/instance/multi_open", key: world.key, body: targets(uuid) });
  expect(started.httpStatus).toBe(200);
  await waitFor(() => fs.existsSync(path.join(cwd, "starts.txt")), { timeout: 15000 });
  return { uuid, cwd, starts: () => Number(fs.readFileSync(path.join(cwd, "starts.txt"), "utf8")) };
}
async function createJob(uuids: string[], seconds = 10) {
  const result = await requestPanel({ method: "POST", path: root, ...admin(),
    body: { targets: uuids.flatMap(targets), seconds, message: "维护; 请稍候重新连接" } });
  expect(result.httpStatus, JSON.stringify(result.data)).toBe(200);
  jobs.push(result.data.id); return result.data;
}
async function getJob(id: string) {
  const result = await requestPanel({ method: "GET", path: `${root}/${id}`, ...admin() });
  expect(result.httpStatus, JSON.stringify(result.data)).toBe(200); return result.data;
}
async function waitState(id: string, state: string) {
  return waitFor(async () => { const job = await getJob(id); return job.targets.some((target: any) => target.state === state) ? job : false; }, { timeout: 35000, interval: 300, msg: `notification state ${state}` });
}

beforeAll(async () => {
  await ensureUser("admin", world.key, 0);
  const promoted = await requestPanel({ method: "PUT", path: "/auth", key: world.key,
    body: { uuid: world.admin.uuid, config: { permission: 10 } } });
  expect(promoted.httpStatus).toBe(200);
  await loginSessionRetry("admin");
  await ensureUser("u1", world.key, 0); saveState();
});
afterAll(async () => {
  for (const id of jobs) await requestPanel({ method: "POST", path: `${root}/${id}/cancel`, key: world.key, body: {} });
  if (instances.length) await requestPanel({ method: "POST", path: "/instance/multi_stop", key: world.key, body: instances.flatMap(targets) });
  if (recoveredPanel) { await sleep(1200); await groupKill(recoveredPanel); }
});

describe("notification restart through real panel and daemon", () => {
  it("denies anonymous and regular users all task APIs", async () => {
    for (const session of [{}, { cookie: world.u1.cookie, token: world.u1.token }]) {
      for (const [method, endpoint, body] of [["GET", root, undefined], ["POST", root, {}], ["GET", `${root}/unknown`, undefined], ["POST", `${root}/unknown/cancel`, {}]] as const) {
        const result = await requestPanel({ method, path: endpoint, body, ...session });
        expect(result.httpStatus).toBe(403);
      }
    }
  });
  it("validates input before reserving tasks", async () => {
    const result = await requestPanel({ method: "POST", path: root, ...admin(), body: { targets: [], seconds: 9, message: "x\nquit" } });
    expect(result.httpStatus).toBe(500);
    expect((await requestPanel({ method: "GET", path: root, ...admin() })).data).toEqual([]);
  });
  it("waits for plugin ACK and full countdown, then confirms exactly one restart", async () => {
    const instance = await createFixture(); const job = await createJob([instance.uuid]);
    await waitState(job.id, "countdown");
    expect(instance.starts()).toBe(1);
    await sleep(1500); expect(instance.starts()).toBe(1);
    const result = await waitState(job.id, "completed");
    expect(instance.starts()).toBe(2); expect(result.targets[0].name).toBe("notice-ack");
    const saved = JSON.parse(fs.readFileSync(path.join(world.workDir, "panel/data/RestartNotice", `${job.id}.json`), "utf8"));
    expect(saved.targets[0].state).toBe("completed");
  });
  it("continues successful targets while skipping a non-acknowledging old plugin", async () => {
    const silent = await createFixture("silent"); const good = await createFixture();
    const job = await createJob([silent.uuid, good.uuid]);
    await waitState(job.id, "completed");
    const result = await getJob(job.id);
    expect(result.targets.find((target: any) => target.instanceUuid === silent.uuid)).toMatchObject({ state: "skipped", reason: "notSupported" });
    expect(silent.starts()).toBe(1); expect(good.starts()).toBe(2);
  });
  it("cancels an accepted countdown and rejects overlapping active jobs", async () => {
    const instance = await createFixture(); const job = await createJob([instance.uuid]);
    await waitState(job.id, "countdown");
    const duplicate = await requestPanel({ method: "POST", path: root, ...admin(), body: { targets: targets(instance.uuid), seconds: 10, message: "duplicate" } });
    expect(duplicate.httpStatus).toBe(500);
    const canceled = await requestPanel({ method: "POST", path: `${root}/${job.id}/cancel`, ...admin(), body: { taskIds: [job.targets[0].taskId] } });
    expect(canceled.data.targets[0].state).toBe("canceled");
    await sleep(11000); expect(instance.starts()).toBe(1);
    expect(fs.readFileSync(path.join(instance.cwd, "commands.log"), "utf8")).toContain(`cancel ${job.targets[0].taskId}`);
  });
  it("aborts when plugin loses task state before the deadline", async () => {
    const instance = await createFixture("lost"); const job = await createJob([instance.uuid]);
    const failed = await waitState(job.id, "failed");
    expect(failed.targets[0].reason).toBe("pluginLost"); expect(instance.starts()).toBe(1);
  });
  it("interrupts on a manual stop without restarting the stopped process later", async () => {
    const instance = await createFixture(); const job = await createJob([instance.uuid]);
    await waitState(job.id, "countdown");
    await requestPanel({ method: "POST", path: "/instance/multi_stop", key: world.key, body: targets(instance.uuid) });
    await waitState(job.id, "interrupted"); await sleep(10500); expect(instance.starts()).toBe(1);
  });
  it("recovers an unfinished job after panel restart without replaying it", async () => {
    const instance = await createFixture(); const job = await createJob([instance.uuid], 60);
    await waitState(job.id, "countdown");
    process.kill(world.panelPid!, "SIGTERM");
    await sleep(1800);
    recoveredPanel = spawnApp({ app: path.join(REPO, "panel/production/app.js"),
      cwd: path.join(world.workDir, "panel"), args: [`--unsafe-integration-test-mode=${world.key}`],
      logFile: path.join(world.workDir, "panel-recovered.log") });
    world.panelPid = recoveredPanel.pid; saveState();
    await waitFor(async () => (await requestPanel({ method: "GET", path: "/auth/status", key: world.key, timeout: 1500 })).httpStatus === 200, { timeout: 20000 });
    await loginSessionRetry("admin");
    const recovered = await waitState(job.id, "interrupted");
    expect(recovered.targets[0].reason).toBe("panelRestarted"); expect(instance.starts()).toBe(1);
    await waitFor(() => fs.readFileSync(path.join(instance.cwd, "commands.log"), "utf8").includes(`cancel ${job.targets[0].taskId}`), { timeout: 20000 });
  });
});
