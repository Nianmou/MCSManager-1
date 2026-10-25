import fs from "node:fs";
import readline from "node:readline";

const mode = process.argv[2] || "ack";
const starts = Number(fs.existsSync("starts.txt") ? fs.readFileSync("starts.txt", "utf8") : "0") + 1;
fs.writeFileSync("starts.txt", String(starts));
let task;
let deadline = 0;
console.log("notification-fixture-ready");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const [command, action, taskId, requestId, seconds] = line.trim().split(/\s+/);
  if (command === "exit") process.exit(0);
  if (command !== "pam_restart_notice") return;
  fs.appendFileSync("commands.log", `${action} ${taskId}\n`);
  if (mode === "silent") return;
  if (action === "begin") { task = taskId; deadline = performance.now() + Number(seconds) * 1000; }
  const remainingMs = Math.max(0, Math.ceil(deadline - performance.now()));
  let state = task !== taskId ? "none" : remainingMs > 0 ? "countdown" : "ready";
  if (action === "status" && mode === "lost") state = "none";
  if (action === "cancel") { task = undefined; state = "canceled"; }
  const ack = "PAM_RESTART_NOTICE " + JSON.stringify({ v: 1, taskId, requestId, action, state, remainingMs }) + "\n";
  // Exercise chunk-boundary parsing through a real process and authenticated socket.
  process.stdout.write(ack.slice(0, 36));
  setTimeout(() => process.stdout.write(ack.slice(36)), 5);
});
setInterval(() => {}, 1000);
