import { randomUUID } from "crypto";
import type RemoteService from "../entity/remote_service";
import RemoteRequest from "./remote_command";
import RemoteServiceSubsystem from "./remote_service";
import { NoticeError, type NoticeAck, type NoticeSession, type NoticeSnapshot, type NoticeTarget, type NoticeTransport } from "./restart_notice";

export const NOTICE_PREFIX = "PAM_RESTART_NOTICE ";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Only complete, bounded protocol lines are accepted; discard oversized lines until LF. */
export class NoticeLineParser {
  private buffer = "";
  private dropping = false;
  private candidate = "";
  private candidateLines = 0;
  constructor(private readonly receive: (ack: NoticeAck) => void) {}
  push(chunk: string) {
    for (const part of chunk.match(/[^\n]*\n|[^\n]+$/g) || []) {
      const complete = part.endsWith("\n");
      if (!this.dropping && this.buffer.length + part.length <= 4096) this.buffer += part;
      else { this.buffer = ""; this.dropping = true; }
      if (!complete) continue;
      if (!this.dropping) {
        // ConPTY inserts cursor/erase CSI sequences and CRLF when a line wraps.
        const line = this.buffer.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim();
        if (line.startsWith(NOTICE_PREFIX)) {
          this.candidate = line.slice(NOTICE_PREFIX.length);
          this.candidateLines = 1;
        } else if (this.candidate) {
          this.candidate += line;
          this.candidateLines++;
        }
        if (this.candidate && this.candidate.length <= 4096 && this.candidateLines <= 8) {
          try {
            const ack = JSON.parse(this.candidate);
            this.candidate = "";
            if (ack?.v === 1 && UUID.test(ack.taskId) && UUID.test(ack.requestId) &&
                ["begin", "status", "cancel"].includes(ack.action) && typeof ack.state === "string" &&
                Number.isFinite(ack.remainingMs) && ack.remainingMs >= 0 && ack.remainingMs <= 3600000)
              this.receive(ack);
          } catch {
            if (this.candidate.endsWith("}")) this.candidate = "";
          }
        } else {
          this.candidate = "";
        }
      } else this.candidate = "";
      this.buffer = "";
      this.dropping = false;
    }
  }
}

interface Channel {
  refs: number;
  ready: Promise<unknown>;
  parser: NoticeLineParser;
  listeners: Set<(event: string, ack?: NoticeAck) => void>;
}
class NodeChannels {
  channels = new Map<string, Channel>();
  private handlers = new Map<string, (...args: any[]) => void>();
  private socket: NonNullable<RemoteService["socket"]>;
  constructor(readonly remote: RemoteService, private readonly empty: () => void) {
    const socket = remote.socket!;
    this.socket = socket;
    for (const event of ["stdout", "stopped", "opened", "failure"]) {
      const handler = (packet: any) => {
        const data = packet?.data;
        if (packet?.status !== 200 || !data) return;
        const channel = this.channels.get(data.instanceUuid);
        if (!channel) return;
        if (event === "stdout") {
          if (typeof data.text === "string") channel.parser.push(data.text);
        } else for (const listener of channel.listeners) listener(event);
      };
      socket.on(`instance/${event}`, handler);
      this.handlers.set(`instance/${event}`, handler);
    }
    const disconnect = () => {
      for (const channel of this.channels.values())
        for (const listener of channel.listeners) listener("disconnect");
    };
    socket.on("disconnect", disconnect);
    this.handlers.set("disconnect", disconnect);
  }

  async acquire(instanceUuid: string, listener: (event: string, ack?: NoticeAck) => void) {
    let channel = this.channels.get(instanceUuid);
    if (!channel) {
      const listeners = new Set<(event: string, ack?: NoticeAck) => void>();
      channel = { refs: 0, ready: Promise.resolve(), listeners,
        parser: new NoticeLineParser((ack) => { for (const callback of listeners) callback("ack", ack); }) };
      this.channels.set(instanceUuid, channel);
    }
    const current = channel;
    if (current.refs++ === 0) current.ready = current.ready.catch(() => {}).then(() => {
      if (this.remote.socket !== this.socket || !this.socket.connected) throw new NoticeError("offline");
      return new RemoteRequest(this.remote).request("instance/forward", { instanceUuid, forward: true });
    });
    current.listeners.add(listener);
    try { await current.ready; }
    catch (error) { await this.release(instanceUuid, listener); throw error; }
  }

  async release(instanceUuid: string, listener: (event: string, ack?: NoticeAck) => void) {
    const channel = this.channels.get(instanceUuid);
    if (!channel || !channel.listeners.delete(listener)) return;
    if (--channel.refs > 0) return;
    channel.ready = channel.ready.catch(() => {}).then(async () => {
      if (this.remote.socket === this.socket && this.socket.connected && this.remote.available)
        await new RemoteRequest(this.remote).request("instance/forward", { instanceUuid, forward: false });
    });
    try { await channel.ready; }
    finally {
      if (!channel.refs) this.channels.delete(instanceUuid);
      if (!this.channels.size) {
        for (const [event, handler] of this.handlers) this.socket.off(event, handler);
        this.empty();
      }
    }
  }
}

export class DaemonNoticeTransport implements NoticeTransport {
  private nodes = new Map<RemoteService["socket"], NodeChannels>();
  constructor(private readonly resolve = (id: string) => RemoteServiceSubsystem.getInstance(id)) {}

  async open(target: NoticeTarget, onEvent: (event: string) => void): Promise<NoticeSession> {
    const remote = this.resolve(target.daemonId);
    if (!remote?.available || !remote.socket?.connected) throw new NoticeError("offline");
    const socket = remote.socket;
    let node = this.nodes.get(socket);
    if (!node) {
      node = new NodeChannels(remote, () => this.nodes.delete(socket));
      this.nodes.set(socket, node);
    }
    const pending = new Map<string, { taskId: string; action: string; resolve: (ack: NoticeAck) => void; reject: (error: Error) => void }>();
    let disposed = false;
    const listener = (event: string, ack?: NoticeAck) => {
      if (event === "ack" && ack) {
        const waiter = pending.get(ack.requestId);
        if (waiter?.taskId === ack.taskId && waiter.action === ack.action) waiter.resolve(ack);
      } else {
        if (event === "disconnect") for (const waiter of pending.values()) waiter.reject(new NoticeError("offline"));
        onEvent(event);
      }
    };
    await node.acquire(target.instanceUuid, listener);
    const request = <T = any>(event: string, data: any) => {
      if (disposed || remote.socket !== socket || !socket.connected || !remote.available) throw new NoticeError("offline");
      return new RemoteRequest(remote).request<T>(event, data);
    };
    return {
      detail: async () => {
        const results = await request<NoticeSnapshot[]>("instance/section", { instanceUuids: [target.instanceUuid] });
        if (!results?.length) throw new NoticeError("notFound");
        return results[0];
      },
      exchange: async (taskId, action, seconds, message) => {
        if (!UUID.test(taskId)) throw new NoticeError("invalidInput");
        const requestId = randomUUID();
        let timer: NodeJS.Timeout | undefined;
        const result = new Promise<NoticeAck>((resolve, reject) => {
          pending.set(requestId, { taskId, action, resolve, reject });
          timer = setTimeout(() => reject(new NoticeError(action === "begin" ? "notSupported" : "pluginLost")), 6000);
        });
        const suffix = action === "begin" ? ` ${seconds} ${Buffer.from(message!, "utf8").toString("base64url")}` : "";
        // Attach the rejection handler before command delivery can time out.
        const delivery = Promise.resolve().then(() => request("instance/command", {
          instanceUuid: target.instanceUuid,
          command: `pam_restart_notice ${action} ${taskId} ${requestId}${suffix}`
        }));
        try { const [ack] = await Promise.all([result, delivery]); return ack; }
        finally { clearTimeout(timer); pending.delete(requestId); }
      },
      restart: async () => { await request("instance/restart", { instanceUuids: [target.instanceUuid] }); },
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        for (const waiter of pending.values()) waiter.reject(new NoticeError("interrupted"));
        await node!.release(target.instanceUuid, listener);
      }
    };
  }
}
