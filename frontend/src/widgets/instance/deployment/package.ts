import { unzipSync } from "fflate";

export type DeploymentMode = "platform" | "plugin";
export type DeploymentPlatform = "linux" | "win32";
export interface PackageEntry {
  path: string;
  bytes: Uint8Array;
  protected: boolean;
}
export interface DeploymentPackage {
  entries: PackageEntry[];
  bytes: number;
  mode: DeploymentMode;
  pluginName: string;
}
export class DeploymentError extends Error {
  constructor(
    public code: string,
    public detail = ""
  ) {
    super(detail);
  }
}
export const deploymentError = (code: string, detail = ""): never => {
  throw new DeploymentError(code, detail);
};
const MAX_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 10000;

export function safeEntryPath(path: string): string {
  if (!path || path.length > 512 || /[\\:\x00-\x1f]/.test(path) || path.startsWith("/"))
    return deploymentError("package", path);
  const parts = path.replace(/\/$/, "").split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    return deploymentError("package", path);
  return parts.join("/");
}

// Inspect declared sizes and Unix entry modes before allocating decompressed data.
export function inspectZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--)
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
      break;
  if (end < 0 || end < bytes.length - 65557) return deploymentError("package");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (!count || count > MAX_FILES || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    return deploymentError("package");
  let total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      return deploymentError("package");
    const size = view.getUint32(offset + 24, true);
    const length = view.getUint16(offset + 28, true);
    const next =
      offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end || size === 0xffffffff || view.getUint16(offset + 8, true) & 1)
      return deploymentError("package");
    const mode = (view.getUint32(offset + 38, true) >>> 16) & 0xf000;
    if (mode && mode !== 0x8000 && mode !== 0x4000) return deploymentError("package");
    const name = safeEntryPath(
      new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length))
    ).toLowerCase();
    if (names.has(name)) return deploymentError("package", name);
    names.add(name);
    total += size;
    if (total > MAX_BYTES) return deploymentError("size");
    offset = next;
  }
}

export async function readPackageFiles(
  files: File[],
  folder: boolean
): Promise<{ path: string; bytes: Uint8Array }[]> {
  if (!files.length || files.length > MAX_FILES) return deploymentError("package");
  if (files.reduce((sum, file) => sum + file.size, 0) > (folder ? MAX_BYTES : 100 * 1024 * 1024))
    return deploymentError("size");
  if (!folder) {
    if (files.length !== 1 || !/\.zip$/i.test(files[0].name)) return deploymentError("package");
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    inspectZip(bytes);
    try {
      return Object.entries(unzipSync(bytes))
        .filter(([path]) => !path.endsWith("/"))
        .map(([path, data]) => ({ path: safeEntryPath(path), bytes: data }));
    } catch (error) {
      if (error instanceof DeploymentError) throw error;
      return deploymentError("package");
    }
  }
  return Promise.all(
    files.map(async (file) => ({
      path: safeEntryPath(file.webkitRelativePath || file.name),
      bytes: new Uint8Array(await file.arrayBuffer())
    }))
  );
}

export function normalizePackage(
  input: { path: string; bytes: Uint8Array }[],
  mode: DeploymentMode,
  pluginName: string
): DeploymentPackage {
  if (!input.length || input.length > MAX_FILES) return deploymentError("package");
  if (mode === "plugin" && !/^[\p{L}\p{N}_-][\p{L}\p{N}_. -]{0,99}$/u.test(pluginName))
    return deploymentError("pluginName");
  let files = input.map((entry) => ({ ...entry, path: safeEntryPath(entry.path) }));
  const roots = ["game/csgo/", "csgo/", "addons/swiftlys2/", "swiftlys2/"];
  if (mode === "platform") {
    // An optional release/folder wrapper is stripped only if every entry shares it.
    if (!files.some((entry) => roots.some((root) => entry.path.startsWith(root)))) {
      const first = files[0].path.split("/")[0] + "/";
      if (files.every((entry) => entry.path.startsWith(first)))
        files = files.map((entry) => ({ ...entry, path: entry.path.slice(first.length) }));
    }
    const wrapper = ["game/csgo/", "csgo/"].find((root) =>
      files.every((entry) => entry.path.startsWith(root))
    );
    if (wrapper)
      files = files.map((entry) => ({ ...entry, path: entry.path.slice(wrapper.length) }));
    if (files.every((entry) => entry.path.startsWith("swiftlys2/")))
      files = files.map((entry) => ({ ...entry, path: "addons/" + entry.path }));
    if (
      files.some(
        (entry) =>
          !entry.path.startsWith("addons/swiftlys2/") &&
          !/^addons\/metamod\/swiftlys2\.vdf$/i.test(entry.path)
      )
    )
      return deploymentError("package");
  } else {
    const prefix = [
      "game/csgo/addons/swiftlys2/plugins/",
      "addons/swiftlys2/plugins/",
      "plugins/"
    ].find((root) => files.every((entry) => entry.path.startsWith(root)));
    if (prefix) files = files.map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }));
    if (files.some((entry) => /^(?:game|csgo|addons|swiftlys2|bin)\//i.test(entry.path)))
      return deploymentError("package");
    if (files.every((entry) => entry.path.startsWith(pluginName + "/")))
      files = files.map((entry) => ({ ...entry, path: entry.path.slice(pluginName.length + 1) }));
    else if (
      files.every((entry) => entry.path.includes("/")) &&
      files.some((entry) => /^[^/]+\/[^/]+\.dll$/i.test(entry.path))
    )
      return deploymentError("pluginName");
    if (files.some((entry) => entry.path.startsWith(pluginName + "/")))
      return deploymentError("pluginName");
    files = files.map((entry) => ({
      ...entry,
      path: `addons/swiftlys2/plugins/${pluginName}/${entry.path}`
    }));
  }
  const names = new Set<string>();
  const entries = files.map((entry) => {
    const path = safeEntryPath(entry.path);
    if (names.has(path.toLowerCase())) return deploymentError("package", path);
    names.add(path.toLowerCase());
    const protectedFile =
      /\/(?:configs?|data|logs?|translations|gamedata)\//i.test(path) ||
      /\.(?:json|ya?ml|toml|ini|cfg|db|sqlite3?)$/i.test(path);
    return {
      ...entry,
      path,
      protected: protectedFile || (mode === "platform" && /\/plugins\//i.test(path))
    };
  });
  const bytes = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);
  if (bytes > MAX_BYTES) return deploymentError("size");
  if (!entries.some((entry) => /\.(?:dll|so)$/i.test(entry.path)))
    return deploymentError("package");
  return { entries, bytes, mode, pluginName };
}

export function assertPackagePlatform(pkg: DeploymentPackage, platform: string) {
  const hasSo = pkg.entries.some((entry) => /\.so(?:\.\d+)*$/i.test(entry.path));
  if (
    (platform === "win32" && hasSo) ||
    (pkg.mode === "platform" && platform === "linux" && !hasSo) ||
    !["linux", "win32"].includes(platform)
  )
    deploymentError("platform", platform);
}

export function patchGameInfo(text: string): string {
  if (/^\s*Game\s+["']?csgo\/addons\/swiftlys2(?:["'\s]|$)/im.test(text)) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  for (const pattern of [
    /^([ \t]*)Game[ \t]+csgo\/addons\/metamod[^\r\n]*(?:\r\n|\n|$)/m,
    /^([ \t]*)Game_LowViolence[ \t]+csgo_lv[^\r\n]*(?:\r\n|\n|$)/m
  ]) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const at = match.index + match[0].length;
      return (
        text.slice(0, at) +
        (/[\r\n]$/.test(match[0]) ? "" : eol) +
        `${match[1]}Game\tcsgo/addons/swiftlys2${eol}` +
        text.slice(at)
      );
    }
  }
  const start = text.search(/\bSearchPaths\b/i);
  const brace = start < 0 ? -1 : text.indexOf("{", start);
  if (brace < 0) return deploymentError("loader");
  return (
    text.slice(0, brace + 1) + `${eol}\t\t\tGame\tcsgo/addons/swiftlys2` + text.slice(brace + 1)
  );
}
