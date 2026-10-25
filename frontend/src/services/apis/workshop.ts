import { apiService } from "@/services/apiService";
import type { InstanceDetail } from "@/types";

export const WORKSHOP_DOWNLOAD_COMMAND = "sw_downloadaddon 3801682815" as const;
export interface WorkshopTarget {
  daemonId: string;
  instanceUuid: string;
  name?: string;
  offline?: boolean;
}
const params = (target: WorkshopTarget) => ({ daemonId: target.daemonId, uuid: target.instanceUuid });
export const readWorkshopInstance = (target: WorkshopTarget, signal: AbortSignal) =>
  apiService.subscribe<InstanceDetail>({ url: "/api/instance", method: "GET",
    params: params(target), signal, timeout: 15000, forceRequest: true });
export const requestWorkshopDownload = (target: WorkshopTarget, signal: AbortSignal) =>
  apiService.subscribe<unknown>({ url: "/api/protected_instance/command", method: "POST",
    params: { ...params(target), command: WORKSHOP_DOWNLOAD_COMMAND },
    signal, timeout: 15000, forceRequest: true });
