import { randomUUID } from "crypto";
import { createConnection } from "net";
import type Instance from "../entity/instance/instance";
let connections = 0;

// Machine commands never use the shell, user command presets or RCON log output.
export async function sendPamRcon(instance: Instance, command: string, signal: AbortSignal) {
  const cfg = instance.config;
  if (!cfg.enableRcon || !cfg.rconPassword || !Number.isInteger(cfg.rconPort) ||
      cfg.rconPort < 1 || cfg.rconPort > 65535) throw new Error("RCON is not configured");
  if (!/^pam_(server_status|restart_notice) [A-Za-z0-9 _-]{1,1600}$/.test(command))
    throw new Error("Invalid protocol command");
  if (signal.aborted) throw new Error("Instance operation interrupted");
  if (connections >= 128) throw new Error("RCON query capacity reached");
  connections++;
  try { await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: cfg.rconIp || "127.0.0.1", port: cfg.rconPort });
    let buffer = Buffer.alloc(0), sent = false, settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      socket.destroy(); error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error("Instance operation interrupted"));
    const timer = setTimeout(() => finish(new Error("RCON delivery timed out")), 6000);
    const packet = (id: number, type: number, text: string) => {
      const body = Buffer.from(text, "utf8"), data = Buffer.alloc(body.length + 14);
      data.writeInt32LE(body.length + 10, 0); data.writeInt32LE(id, 4);
      data.writeInt32LE(type, 8); body.copy(data, 12); return data;
    };
    signal.addEventListener("abort", abort, { once: true });
    socket.once("connect", () => socket.write(packet(1, 3, cfg.rconPassword)));
    socket.on("error", () => finish(new Error("RCON connection failed")));
    socket.once("close", () => finish(new Error("RCON connection closed")));
    socket.on("data", (chunk: Buffer) => {
      if (sent || settled) return;
      if (buffer.length + chunk.length > 8192) return finish(new Error("Invalid RCON response"));
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (size < 10 || size > 4096) return finish(new Error("Invalid RCON response"));
        if (buffer.length < size + 4) return;
        const id = buffer.readInt32LE(4), type = buffer.readInt32LE(8);
        buffer = buffer.subarray(size + 4);
        if (type !== 2) continue;
        if (id !== 1) return finish(new Error("RCON authentication failed"));
        sent = true;
        socket.write(packet(2, 2, command), (error) => finish(error || undefined));
        return;
      }
    });
  }); } finally { connections--; }
}

// Bound both unterminated lines and ConPTY-wrapped JSON, including ANSI sequences.
export class PamLineParser {
  private line = "";
  private dropping = false;
  private candidate = "";
  private lines = 0;
  constructor(private readonly prefix: string, private readonly receive: (data: any) => void) {}
  push(text: string) {
    for (const part of text.split(/(?<=\n)/)) {
      if (this.line.length + part.length <= 4096) this.line += part;
      else { this.line = ""; this.dropping = true; }
      if (!part.endsWith("\n")) continue;
      const line = this.line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim();
      this.line = "";
      if (this.dropping) { this.dropping = false; this.candidate = ""; continue; }
      if (line.startsWith(this.prefix)) { this.candidate = line.slice(this.prefix.length); this.lines = 1; }
      else if (this.candidate) { this.candidate += line; this.lines++; }
      if (this.candidate.length > 4096 || this.lines > 8) { this.candidate = ""; continue; }
      if (!this.candidate) continue;
      try { const value = JSON.parse(this.candidate); this.candidate = ""; this.receive(value); }
      catch { if (this.candidate.endsWith("}")) this.candidate = ""; }
    }
  }
}

export type PamDelivery = typeof sendPamRcon;
export async function pamExchange(instance: Instance, prefix: string,
  command: (requestId: string) => string, matches: (data: any) => boolean,
  signal: AbortSignal, deliver: PamDelivery = sendPamRcon): Promise<any> {
  if (signal.aborted) throw new Error("Instance operation interrupted");
  const requestId = randomUUID();
  let timer: NodeJS.Timeout | undefined;
  let abort = () => {};
  const controller = new AbortController();
  let parser: PamLineParser;
  const onData = (text: string) => parser.push(String(text));
  const result = new Promise<any>((resolve, reject) => {
    parser = new PamLineParser(prefix, (data) => {
      if (data?.v === 1 && data.requestId === requestId && matches(data)) resolve(data);
    });
    abort = () => { controller.abort(); reject(new Error("Instance operation interrupted")); };
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error("Plugin confirmation timed out or unsupported")); }, 6000);
    instance.on("data", onData);
  });
  try {
    const [data] = await Promise.all([result, Promise.resolve().then(() => deliver(instance, command(requestId), controller.signal))]);
    return data;
  } finally {
    clearTimeout(timer); controller.abort(); signal.removeEventListener("abort", abort);
    instance.off("data", onData);
  }
}
