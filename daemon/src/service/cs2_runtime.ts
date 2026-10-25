import type Instance from "../entity/instance/instance";
import { pamExchange, type PamDelivery } from "./pam_protocol";

export interface Cs2Runtime {
  state: "available" | "unavailable";
  checkedAt: number;
  players?: number;
  pluginVersion?: string;
  platformVersion?: string;
  addonsManager?: { state: "loaded" | "not_loaded" | "unknown"; version?: string };
}
export function normalizeAddonsManager(value: unknown): NonNullable<Cs2Runtime["addonsManager"]> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { state, version } = value as Record<string, unknown>;
    if (state === "not_loaded") return { state };
    if (state === "loaded" && typeof version === "string" && version.trim().length > 0 &&
      version.length <= 96 && !/[\u0000-\u001f\u007f-\u009f]/.test(version)) return { state, version };
  }
  return { state: "unknown" };
}
const version = (value: unknown) => typeof value === "string" &&
  /^[0-9][A-Za-z0-9.+_-]{0,95}$/.test(value);
export async function queryCs2Runtime(instance: Instance, signal: AbortSignal, deliver?: PamDelivery): Promise<Cs2Runtime> {
  const data = await pamExchange(instance, "PAM_SERVER_STATUS ",
    (request) => `pam_server_status ${request}`,
    (data) => Number.isInteger(data.players) && data.players >= 0 && data.players <= 256 &&
      version(data.pluginVersion) && version(data.platformVersion), signal, deliver);
  return { state: "available", checkedAt: Date.now(), players: data.players,
    pluginVersion: data.pluginVersion, platformVersion: data.platformVersion,
    addonsManager: normalizeAddonsManager(data.addonsManager) };
}
