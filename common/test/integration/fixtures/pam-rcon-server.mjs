import fs from "node:fs";
import net from "node:net";
import readline from "node:readline";

const port = Number(process.argv[2]), mode = process.argv[3] || "ack";
const starts = Number(fs.existsSync("starts.txt") ? fs.readFileSync("starts.txt", "utf8") : 0) + 1;
fs.writeFileSync("starts.txt", String(starts));
fs.writeFileSync("pid.txt", String(process.pid));
let task, deadline = 0;
function command(text) {
  const [cmd, action, taskId, requestId, seconds] = text.trim().split(/\s+/);
  fs.appendFileSync("commands.log", `${Date.now()} ${text}\n`);
  if (cmd === "quit" || cmd === "exit") { setTimeout(() => process.exit(0), 100); return; }
  if (mode === "silent") return;
  let prefix, data;
  if (cmd === "pam_server_status") {
    prefix = "PAM_SERVER_STATUS "; data = { v: 1, requestId: action, players: 3, pluginVersion: "2.0.0.11", platformVersion: "1.5.0" };
    if (mode !== "old") data.addonsManager = mode === "absent" ? { state: "not_loaded" } :
      mode === "malformed" ? { state: "loaded", version: "bad\nversion" } : { state: "loaded", version: "1.2.3" };
  } else if (cmd === "pam_restart_notice") {
    let state;
    if (action === "begin") {
      if (task && task !== taskId) state = "conflict";
      else if (!task) { task = taskId; deadline = performance.now() + Number(seconds) * 1000; }
    }
    const remainingMs = Math.max(0, Math.ceil(deadline - performance.now()));
    state ||= task !== taskId ? "none" : remainingMs > 0 ? "countdown" : "ready";
    if (action === "status" && mode === "lost") state = "none";
    if (action === "cancel" && task === taskId) { task = undefined; state = "canceled"; }
    prefix = "PAM_RESTART_NOTICE "; data = { v: 1, taskId, requestId, action, state, remainingMs };
  } else return;
  const ack = prefix + JSON.stringify(data) + "\n";
  // Delayed, fragmented stdout is authoritative; the RCON response itself is empty.
  setTimeout(() => {
    process.stdout.write(ack.slice(0, 36));
    setTimeout(() => process.stdout.write(ack.slice(36)), 5);
  }, 30);
}
const packet = (id, type, body = "") => {
  const text = Buffer.from(body), result = Buffer.alloc(text.length + 14);
  result.writeInt32LE(text.length + 10); result.writeInt32LE(id, 4); result.writeInt32LE(type, 8);
  text.copy(result, 12); return result;
};
net.createServer((socket) => {
  let buffer = Buffer.alloc(0), authenticated = false;
  socket.on("error", () => {});
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readInt32LE();
      if (size < 10 || size > 4096) { socket.destroy(); return; }
      if (buffer.length < size + 4) return;
      const id = buffer.readInt32LE(4), type = buffer.readInt32LE(8);
      const body = buffer.subarray(12, size + 2).toString("utf8"); buffer = buffer.subarray(size + 4);
      if (type === 3) {
        authenticated = body === "fixture-secret";
        socket.write(packet(authenticated ? id : -1, 2));
      } else if (type === 2 && authenticated) {
        socket.write(packet(id, 0)); command(body);
      }
    }
  });
}).listen(port, "127.0.0.1", () => console.log("rcon-fixture-ready"));
readline.createInterface({ input: process.stdin }).on("line", command);
