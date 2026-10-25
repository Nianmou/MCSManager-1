import { randomUUID } from "crypto";
import { performance } from "perf_hooks";
import type { IStorage } from "../common/storage/storage_interface";

export type NoticeState =
  | "pending" | "countdown" | "restarting" | "completed"
  | "skipped" | "canceled" | "interrupted" | "failed";
export interface NoticeTarget {
  daemonId: string;
  instanceUuid: string;
}
export interface NoticeResult extends NoticeTarget {
  taskId: string;
  name: string;
  state: NoticeState;
  reason?: string;
  deadline?: number;
}
export class NoticeJob {
  id = "";
  createdAt = 0;
  finishedAt = 0;
  seconds = 15;
  message = "";
  targets: NoticeResult[] = [];
}
export interface NoticeAck {
  v: number;
  taskId: string;
  requestId: string;
  action: string;
  state: string;
  remainingMs: number;
}
export interface NoticeSnapshot {
  status: number;
  started: number;
  config?: { nickname?: string };
}
export interface NoticeSession {
  detail(): Promise<NoticeSnapshot>;
  exchange(taskId: string, action: "begin" | "status" | "cancel", seconds?: number, message?: string): Promise<NoticeAck>;
  restart(): Promise<void>;
  dispose(): Promise<void>;
}
export interface NoticeTransport {
  open(target: NoticeTarget, onEvent: (event: string) => void): Promise<NoticeSession>;
}
export class NoticeError extends Error {
  constructor(public readonly code: string) { super(code); }
}
const CATEGORY = "RestartNotice";
const ACTIVE = new Set<NoticeState>(["pending", "countdown", "restarting"]);
const key = (target: NoticeTarget) => `${target.daemonId}:${target.instanceUuid}`;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const isNoticeActive = (target: NoticeResult) => ACTIVE.has(target.state);

export function validateNoticeInput(input: any): { targets: NoticeTarget[]; seconds: number; message: string } {
  if (!input || !Number.isInteger(input.seconds) || input.seconds < 10 || input.seconds > 3600 ||
      typeof input.message !== "string" || !input.message.trim() || input.message.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(input.message) || !Array.isArray(input.targets) ||
      !input.targets.length || input.targets.length > 100) throw new NoticeError("invalidInput");
  const targets = new Map<string, NoticeTarget>();
  for (const target of input.targets) {
    if (!target || ![target.daemonId, target.instanceUuid].every((id) =>
      typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id))) throw new NoticeError("invalidInput");
    targets.set(key(target), { daemonId: target.daemonId, instanceUuid: target.instanceUuid });
  }
  return { targets: [...targets.values()], seconds: input.seconds, message: input.message.trim() };
}

interface Runtime {
  session?: NoticeSession;
  controller: AbortController;
  stopped: boolean;
  opened: boolean;
}

export class RestartNoticeService {
  private jobs = new Map<string, NoticeJob>();
  private reservations = new Set<string>();
  private runtimes = new Map<string, Runtime>();
  private writes: Promise<unknown> = Promise.resolve();
  private creates: Promise<unknown> = Promise.resolve();
  private maintenance?: NodeJS.Timeout;
  private recovery = new Map<string, { target: NoticeResult; until: number }>();
  private recovering = false;

  constructor(
    private readonly storage: () => IStorage,
    private readonly transport: NoticeTransport,
    private readonly log: (error: unknown) => void,
    private readonly monotonic = () => performance.now()
  ) {}

  async initialize() {
    for (const id of await this.storage().list(CATEGORY)) {
      const job = await this.storage().load(CATEGORY, NoticeJob, id) as NoticeJob | null;
      if (!job || !job.id || !Array.isArray(job.targets)) continue;
      this.jobs.set(job.id, job);
      for (const target of job.targets) {
        if (!isNoticeActive(target)) continue;
        target.state = "interrupted";
        target.reason = "panelRestarted";
        this.recovery.set(target.taskId, { target, until: Date.now() + 120000 });
      }
      await this.save(job);
    }
    await this.prune();
    this.maintenance = setInterval(() => {
      void this.prune().catch(this.log);
      void this.reconcile().catch(this.log);
    }, 10000);
    this.maintenance.unref();
    void this.reconcile().catch(this.log);
  }

  private async reconcile() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      for (const [id, recovery] of this.recovery) {
        if (Date.now() > recovery.until) { this.recovery.delete(id); continue; }
        let session: NoticeSession | undefined;
        try {
          session = await this.transport.open(recovery.target, () => {});
          await session.exchange(id, "cancel");
          this.recovery.delete(id);
        } catch (error) {
          // Retry briefly after node authentication; never replay a restart.
          if (!(error instanceof NoticeError && error.code === "offline")) this.log(error);
        } finally { if (session) await session.dispose().catch(this.log); }
      }
    } finally { this.recovering = false; }
  }

  private save(job: NoticeJob) {
    if (!job.finishedAt && job.targets.every((target) => !isNoticeActive(target))) job.finishedAt = Date.now();
    const snapshot = copy(job);
    const write = this.writes.then(() => this.storage().store(CATEGORY, job.id, snapshot));
    this.writes = write.catch(this.log);
    return write;
  }

  private async prune() {
    const completed = [...this.jobs.values()].filter((job) => job.finishedAt)
      .sort((a, b) => b.finishedAt - a.finishedAt);
    for (let i = 0; i < completed.length; i++) {
      const job = completed[i];
      if (i < 200 && Date.now() - job.finishedAt < 86400000) continue;
      await this.writes;
      await this.storage().delete(CATEGORY, job.id);
      this.jobs.delete(job.id);
    }
  }

  list() { return copy([...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt)); }
  get(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NoticeError("notFound");
    return copy(job);
  }

  create(input: unknown): Promise<NoticeJob> {
    const validated = validateNoticeInput(input);
    const work = this.creates.then(async () => {
      await this.prune();
      if (this.reservations.size + validated.targets.length > 100) throw new NoticeError("capacity");
      if (validated.targets.some((target) => this.reservations.has(key(target)))) throw new NoticeError("busy");
      const job = Object.assign(new NoticeJob(), {
        id: randomUUID(), createdAt: Date.now(), seconds: validated.seconds, message: validated.message,
        targets: validated.targets.map((target): NoticeResult => ({
          ...target, taskId: randomUUID(), name: target.instanceUuid, state: "pending"
        }))
      });
      job.targets.forEach((target) => this.reservations.add(key(target)));
      try { await this.save(job); }
      catch (error) { job.targets.forEach((target) => this.reservations.delete(key(target))); throw error; }
      this.jobs.set(job.id, job);
      for (const target of job.targets) {
        const runtime: Runtime = { controller: new AbortController(), stopped: false, opened: false };
        this.runtimes.set(target.taskId, runtime);
        void this.run(job, target, runtime).catch(this.log);
      }
      return copy(job);
    });
    this.creates = work.catch(() => {});
    return work;
  }

  async cancel(id: string, taskIds?: string[]) {
    const job = this.jobs.get(id);
    if (!job) throw new NoticeError("notFound");
    if (taskIds !== undefined && (!Array.isArray(taskIds) || taskIds.some((id) => typeof id !== "string") || taskIds.length > 100))
      throw new NoticeError("invalidInput");
    for (const target of job.targets) {
      if ((taskIds && !taskIds.includes(target.taskId)) || !["pending", "countdown"].includes(target.state)) continue;
      target.state = "canceled";
      target.reason = "canceled";
      this.runtimes.get(target.taskId)?.controller.abort();
    }
    await this.save(job);
    return copy(job);
  }

  private async pause(runtime: Runtime, ms: number) {
    if (runtime.controller.signal.aborted) return;
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); runtime.controller.signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, ms);
      runtime.controller.signal.addEventListener("abort", done, { once: true });
    });
  }

  private async run(job: NoticeJob, target: NoticeResult, runtime: Runtime) {
    const interrupt = (reason: string) => {
      if (!isNoticeActive(target)) return;
      target.state = "interrupted";
      target.reason = reason;
      runtime.controller.abort();
    };
    const check = () => {
      if (runtime.controller.signal.aborted || !isNoticeActive(target)) throw new NoticeError(target.reason || "interrupted");
    };
    try {
      runtime.session = await this.transport.open(target, (event) => {
        if (event === "disconnect") interrupt("offline");
        else if (target.state === "restarting") {
          if (event === "stopped") runtime.stopped = true;
          if (event === "opened" && runtime.stopped) runtime.opened = true;
          if (event === "failure") interrupt("restartFailed");
        } else interrupt("instanceChanged");
      });
      check();
      const initial = await runtime.session.detail();
      check();
      if (initial.status !== 3) throw new NoticeError("notRunning");
      target.name = initial.config?.nickname || target.instanceUuid;
      const ack = await runtime.session.exchange(target.taskId, "begin", job.seconds, job.message);
      check();
      if (ack.state === "conflict") throw new NoticeError("pluginBusy");
      if (ack.state !== "countdown" || ack.remainingMs <= 0 || ack.remainingMs > job.seconds * 1000)
        throw new NoticeError("notSupported");
      const due = this.monotonic() + ack.remainingMs;
      target.deadline = Date.now() + ack.remainingMs;
      target.state = "countdown";
      await this.save(job);
      let nextCheck = this.monotonic() + 5000;
      const verify = async () => {
        const detail = await runtime.session!.detail();
        check();
        if (detail.status !== 3 || detail.started !== initial.started) throw new NoticeError("instanceChanged");
        const status = await runtime.session!.exchange(target.taskId, "status");
        check();
        if (!["countdown", "ready"].includes(status.state)) throw new NoticeError("pluginLost");
      };
      while (this.monotonic() < due) {
        await this.pause(runtime, Math.min(1000, due - this.monotonic()));
        check();
        if (this.monotonic() >= nextCheck && this.monotonic() < due) {
          await verify();
          nextCheck = this.monotonic() + 5000;
        }
      }
      await verify();
      check();
      target.state = "restarting";
      // Persist intent before issuing the side effect. Recovery never retries it.
      await this.save(job);
      check();
      await runtime.session.restart();
      const restartLimit = this.monotonic() + 120000;
      while (this.monotonic() < restartLimit) {
        check();
        if (runtime.stopped && runtime.opened) {
          const detail = await runtime.session.detail();
          check();
          if (detail.status === 3 && detail.started > initial.started) {
            target.state = "completed";
            return;
          }
        }
        await this.pause(runtime, 500);
      }
      throw new NoticeError("restartTimeout");
    } catch (error) {
      if (isNoticeActive(target)) {
        target.reason = error instanceof NoticeError ? error.code : "operationFailed";
        target.state = target.state === "pending" ? "skipped" : "failed";
      }
      if (!(error instanceof NoticeError)) this.log(error);
    } finally {
      if (runtime.session) {
        if (target.state !== "completed") await runtime.session.exchange(target.taskId, "cancel").catch(this.log);
        await runtime.session.dispose().catch(this.log);
      }
      this.reservations.delete(key(target));
      this.runtimes.delete(target.taskId);
      await this.save(job);
    }
  }

  async dispose() {
    clearInterval(this.maintenance);
    for (const job of this.jobs.values()) await this.cancel(job.id);
  }
}
