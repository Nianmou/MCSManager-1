import type { InstanceDetail } from "@/types";

export function instanceTelemetry(instance?: Pick<InstanceDetail, "status" | "info">, now = Date.now()) {
  const info = instance?.info;
  const cs2 = info?.cs2;
  const fresh = instance?.status === 3 && cs2?.state === "available" &&
    now - cs2.checkedAt <= 30000 && now - cs2.checkedAt >= -30000;
  return {
    players: fresh && Number.isInteger(cs2?.players) ? String(cs2!.players) :
      instance?.status === 3 && info?.mcPingOnline ? `${info.currentPlayers} / ${info.maxPlayers}` : undefined,
    pluginVersion: fresh ? cs2?.pluginVersion : undefined,
    platformVersion: fresh ? cs2?.platformVersion : undefined,
    addonsManager: fresh && cs2?.addonsManager?.state === "not_loaded" ? "not_loaded" :
      fresh && cs2?.addonsManager?.state === "loaded" && typeof cs2.addonsManager.version === "string" &&
      cs2.addonsManager.version.trim().length > 0 && cs2.addonsManager.version.length <= 96 &&
      !/[\u0000-\u001f\u007f-\u009f]/.test(cs2.addonsManager.version) ? "loaded" : "unknown",
    addonsManagerVersion: fresh && cs2?.addonsManager?.state === "loaded" ? cs2.addonsManager.version : undefined
  };
}
