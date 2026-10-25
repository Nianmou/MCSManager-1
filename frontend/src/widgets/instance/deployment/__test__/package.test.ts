import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  assertPackagePlatform,
  inspectZip,
  normalizePackage,
  patchGameInfo,
  safeEntryPath
} from "../package";
const entry = (path: string) => ({ path, bytes: strToU8("test") });
describe("CS2 package mapping", () => {
  it.each(["game/csgo/", "csgo/", "", "release/game/csgo/"])(
    "normalizes platform wrapper %s",
    (root) => {
      expect(
        normalizePackage([entry(root + "addons/swiftlys2/bin/swiftlys2.so")], "platform", "")
          .entries[0].path
      ).toBe("addons/swiftlys2/bin/swiftlys2.so");
    }
  );
  it.each(["PreAimMode/", "plugins/PreAimMode/", "addons/swiftlys2/plugins/PreAimMode/", ""])(
    "maps plugin %s once",
    (root) => {
      expect(
        normalizePackage([entry(root + "PreAimMode.dll")], "plugin", "PreAimMode").entries[0].path
      ).toBe("addons/swiftlys2/plugins/PreAimMode/PreAimMode.dll");
    }
  );
  it("marks configuration and existing platform plugin content for protection", () => {
    const pkg = normalizePackage(
      [
        entry("addons/swiftlys2/bin/runtime.so"),
        entry("addons/swiftlys2/configs/core.json"),
        entry("addons/swiftlys2/plugins/Example/Example.dll")
      ],
      "platform",
      ""
    );
    expect(pkg.entries.map((item) => item.protected)).toEqual([false, true, true]);
  });
  it.each([
    "../outside.dll",
    "/tmp/plugin.dll",
    "C:/x.dll",
    "folder\\file.dll",
    "a/../b.dll",
    "a//b.dll"
  ])("rejects unsafe path %s", (path) => {
    expect(() => safeEntryPath(path)).toThrow();
  });
  it("rejects ambiguous roots, duplicate paths, and platform files in plugin mode", () => {
    expect(() => normalizePackage([entry("P/P/P.dll")], "plugin", "P")).toThrow();
    expect(() =>
      normalizePackage(
        [entry("game/csgo/addons/swiftlys2/bin/a.so"), entry("unrelated.txt")],
        "platform",
        ""
      )
    ).toThrow();
    expect(() => normalizePackage([entry("A.dll"), entry("a.dll")], "plugin", "P")).toThrow();
    expect(() => normalizePackage([entry("addons/swiftlys2/bin/a.so")], "plugin", "P")).toThrow();
  });
  it("checks node platform and validates ZIP metadata before extraction", () => {
    const pkg = normalizePackage([entry("addons/swiftlys2/bin/a.so")], "platform", "");
    expect(() => assertPackagePlatform(pkg, "win32")).toThrow();
    expect(() => assertPackagePlatform(pkg, "linux")).not.toThrow();
    expect(() => inspectZip(zipSync({ "P/P.dll": strToU8("dll") }))).not.toThrow();
    expect(() => inspectZip(zipSync({ "../outside": strToU8("x") }))).toThrow();
    expect(() => inspectZip(new Uint8Array(10))).toThrow();
  });
  it("rejects oversized expanded ZIPs and symlink entries before decompression", () => {
    for (const change of ["size", "symlink"]) {
      const bytes = zipSync({ "P.dll": strToU8("dll") });
      const view = new DataView(bytes.buffer);
      const central = bytes.findIndex(
        (_: number, i: number) => i + 4 < bytes.length && view.getUint32(i, true) === 0x02014b50
      );
      if (change === "size") view.setUint32(central + 24, 300 * 1024 * 1024, true);
      else view.setUint32(central + 38, 0xa1ff0000, true);
      expect(() => inspectZip(bytes)).toThrow();
    }
  });
  it("patches the loader idempotently in the correct load order", () => {
    const original = "SearchPaths\r\n{\r\n  Game csgo/addons/metamod\r\n  Game csgo\r\n}";
    const patched = patchGameInfo(original);
    expect(patched).toContain(
      "Game csgo/addons/metamod\r\n  Game\tcsgo/addons/swiftlys2\r\n  Game csgo"
    );
    expect(patchGameInfo(patched)).toBe(patched);
    expect(() => patchGameInfo("invalid")).toThrow();
  });
});
