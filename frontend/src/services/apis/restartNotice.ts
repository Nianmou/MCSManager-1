import { useDefineApi } from "@/stores/useDefineApi";

export interface RestartNoticeTarget {
  daemonId: string;
  instanceUuid: string;
  name?: string;
}
export type RestartNoticeState = "pending" | "countdown" | "restarting" | "completed" |
  "skipped" | "canceled" | "interrupted" | "failed";
export interface RestartNoticeResult extends RestartNoticeTarget {
  taskId: string;
  state: RestartNoticeState;
  reason?: string;
  deadline?: number;
}
export interface RestartNoticeJob {
  id: string;
  createdAt: number;
  finishedAt: number;
  seconds: number;
  message: string;
  targets: RestartNoticeResult[];
}
export const restartNoticeList = useDefineApi<{}, RestartNoticeJob[]>({
  url: "/api/instance/restart_notice", method: "GET"
});
export const restartNoticeCreate = useDefineApi<{
  data: { targets: RestartNoticeTarget[]; seconds: number; message: string };
}, RestartNoticeJob>({ url: "/api/instance/restart_notice", method: "POST" });
export const restartNoticeDetail = (id: string) => useDefineApi<{}, RestartNoticeJob>({
  url: `/api/instance/restart_notice/${encodeURIComponent(id)}`, method: "GET"
})();
export const restartNoticeCancel = (id: string) => useDefineApi<{
  data: { taskIds?: string[] };
}, RestartNoticeJob>({ url: `/api/instance/restart_notice/${encodeURIComponent(id)}/cancel`, method: "POST" })();
