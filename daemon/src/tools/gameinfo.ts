import fs from "fs-extra";
import path from "path";
import Instance from "../entity/instance/instance";

// SwiftlyS2 registers itself in game/csgo/gameinfo.gi under SearchPaths with the line
// "Game csgo/addons/swiftlys2". Steam app_update rewrites gameinfo.gi and wipes this entry,
// so we re-check (and re-add) it on every instance start.
//
// Required load order (per swiftlys2.net docs and multiple independent installers):
//   Game_LowViolence csgo_lv
//   Game csgo/addons/metamod      <- metamod must precede swiftlys2 when present
//   Game csgo/addons/swiftlys2
//   Game csgo
const SWIFTLYS2_SEARCH_PATH = "csgo/addons/swiftlys2";

function findGameInfoPath(cwd: string): string | undefined {
  const candidates = [
    path.join(cwd, "game", "csgo", "gameinfo.gi"),
    path.join(cwd, "csgo", "gameinfo.gi"),
    path.join(cwd, "gameinfo.gi")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

// Anchor lines we may insert directly after, in priority order. metamod first so that
// swiftlys2 lands below it when both frameworks are installed.
const ANCHOR_PATTERNS = [
  /^([ \t]*)Game[ \t]+csgo\/addons\/metamod[^\r\n]*(?:\r\n|\n|\r|$)/m,
  /^([ \t]*)Game_LowViolence[ \t]+csgo_lv[^\r\n]*(?:\r\n|\n|\r|$)/m
];

function findAnchor(text: string): { insertAt: number; indent: string } | undefined {
  for (const re of ANCHOR_PATTERNS) {
    const m = re.exec(text);
    if (m && m.index !== undefined) {
      return { insertAt: m.index + m[0].length, indent: m[1] || "\t\t\t" };
    }
  }
  return undefined;
}

// Returns true when this is a CS2/Source2 instance (a gameinfo.gi was found),
// false when the instance has no gameinfo.gi and must be left untouched.
export async function ensureSwiftlyS2GameInfo(instance: Instance): Promise<boolean> {
  let cwd: string;
  try {
    cwd = instance.absoluteCwdPath();
  } catch {
    return false;
  }

  const giPath = findGameInfoPath(cwd);
  // Not a CS2 instance -> skip silently so Minecraft/other instances are unaffected.
  if (!giPath) return false;

  const text = await fs.readFile(giPath, "utf-8");

  if (text.toLowerCase().includes(SWIFTLYS2_SEARCH_PATH)) {
    instance.println("INFO", `[SwiftlyS2] gameinfo.gi 已包含 ${SWIFTLYS2_SEARCH_PATH}，无需处理`);
    return true;
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const anchor = findAnchor(text);

  let patched: string;
  if (anchor) {
    const before = text.slice(0, anchor.insertAt);
    // Guard: only add a leading newline if the anchor line did not already end with one.
    const sep = /[\r\n]$/.test(before) ? "" : eol;
    const line = `${anchor.indent}Game\t${SWIFTLYS2_SEARCH_PATH}`;
    patched = before + sep + line + eol + text.slice(anchor.insertAt);
  } else {
    // Fallback: no metamod / Game_LowViolence anchor -> insert as first SearchPaths entry.
    const searchPathsIdx = text.search(/SearchPaths/i);
    const braceIdx = searchPathsIdx === -1 ? -1 : text.indexOf("{", searchPathsIdx);
    if (searchPathsIdx === -1 || braceIdx === -1) {
      instance.println(
        "WARN",
        `[SwiftlyS2] gameinfo.gi 缺少 SearchPaths 块，无法自动补写，插件可能不会加载: ${giPath}`
      );
      return true;
    }
    patched =
      text.slice(0, braceIdx + 1) + eol + `\t\t\tGame\t${SWIFTLYS2_SEARCH_PATH}` + text.slice(braceIdx + 1);
  }

  await fs.writeFile(giPath, patched, "utf-8");
  instance.println(
    "WARN",
    `[SwiftlyS2] gameinfo.gi 缺少 ${SWIFTLYS2_SEARCH_PATH}（可能被 app_update 刷掉），已自动补写并继续启动: ${giPath}`
  );
  return true;
}
