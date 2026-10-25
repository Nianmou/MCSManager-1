import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { DaemonNoticeTransport, NoticeLineParser, NOTICE_PREFIX } from "../restart_notice_transport";

const ack = { v: 1, taskId: "01234567-89ab-4cde-8fab-012345678901", requestId: "11234567-89ab-4cde-8fab-012345678901", action: "begin", state: "countdown", remainingMs: 10000 };
describe("notification output protocol", () => {
  it("reassembles bounded ConPTY soft wraps and cursor/erase controls", () => {
    const seen: any[] = []; const parser = new NoticeLineParser((value) => seen.push(value));
    const line = NOTICE_PREFIX + JSON.stringify(ack);
    parser.push("\x1b[?25h" + line.slice(0, 164) + "\x1b[0K\r\n");
    parser.push(line.slice(164) + "\r\n");
    expect(seen).toEqual([ack]);
  });
  it("parses fragmented complete lines without treating chat or malformed output as ACK", () => {
    const seen: any[] = []; const parser = new NoticeLineParser((value) => seen.push(value));
    const line = NOTICE_PREFIX + JSON.stringify(ack) + "\r\n";
    parser.push("player: " + line); parser.push(NOTICE_PREFIX + "{bad}\n");
    parser.push(line.slice(0, 35)); expect(seen).toHaveLength(0);
    parser.push(line.slice(35)); expect(seen).toEqual([ack]);
  });
  it("rejects oversize output and malformed versions/identifiers, then recovers at newline", () => {
    const seen: any[] = []; const parser = new NoticeLineParser((value) => seen.push(value));
    parser.push("x".repeat(5000)); parser.push(NOTICE_PREFIX + JSON.stringify(ack) + "\n");
    for (const patch of [{ v: 2 }, { requestId: "wrong" }, { remainingMs: -1 }, { taskId: "wrong" }])
      parser.push(NOTICE_PREFIX + JSON.stringify({ ...ack, ...patch }) + "\n");
    expect(seen).toHaveLength(0);
    parser.push(NOTICE_PREFIX + JSON.stringify(ack) + "\n"); expect(seen).toEqual([ack]);
  });
});

function fixture(notify: (command: string, socket: EventEmitter) => void = () => {}) {
  const socket = Object.assign(new EventEmitter(), { connected: true });
  const commands: string[] = [];
  const forwards: boolean[] = [];
  const remote: any = { socket, available: true, config: {}, emit: (event: string, packet: any) => {
    if (event === "instance/forward") forwards.push(packet.data.forward);
    socket.emit(event, { ...packet, status: 200, data: event === "instance/section" ? [{ status: 3, started: 1 }] : true });
    if (event === "instance/command") { commands.push(packet.data.command); notify(packet.data.command, socket); }
  } };
  return { socket, commands, forwards, transport: new DaemonNoticeTransport(() => remote) };
}
const target = { daemonId: "node", instanceUuid: "instance" };
describe("authenticated notification transport", () => {
  it("shares and reference-counts one node/instance subscription, removing all owned listeners", async () => {
    const f = fixture();
    const first = await f.transport.open(target, () => {});
    const second = await f.transport.open(target, () => {});
    expect(f.forwards).toEqual([true]);
    await first.dispose(); expect(f.forwards).toEqual([true]);
    await second.dispose(); expect(f.forwards).toEqual([true, false]);
    expect(f.socket.eventNames()).toEqual([]);
  });
  it("registers before send and accepts only the matching task, action and request nonce", async () => {
    const f = fixture((command, socket) => {
      const [, action, taskId, requestId] = command.split(" ");
      const emit = (patch: object) => socket.emit("instance/stdout", { status: 200, data: {
        instanceUuid: target.instanceUuid, text: NOTICE_PREFIX + JSON.stringify({ ...ack, taskId, requestId, action, ...patch }) + "\n"
      } });
      emit({ requestId: ack.requestId, state: "wrong" });
      emit({ taskId: ack.requestId, state: "wrong" });
      emit({ action: "cancel", state: "wrong" });
      emit({});
    });
    const session = await f.transport.open(target, () => {});
    const result = await session.exchange(ack.taskId, "begin", 10, "你好; quit");
    expect(result.state).toBe("countdown");
    expect(f.commands[0]).not.toContain("quit");
    expect(f.commands[0].split(" ")).toHaveLength(6);
    await session.dispose();
  });
  it("does not treat daemon command delivery as plugin acknowledgement", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); const session = await f.transport.open(target, () => {});
      const promise = expect(session.exchange(ack.taskId, "begin", 10, "test")).rejects.toThrow("notSupported");
      await vi.advanceTimersByTimeAsync(6000); await promise;
      await session.dispose(); expect(f.socket.eventNames()).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});
