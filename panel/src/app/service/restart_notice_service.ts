import Storage from "../common/storage/sys_storage";
import { logger } from "./log";
import { RestartNoticeService } from "./restart_notice";
import { DaemonNoticeTransport } from "./restart_notice_transport";

export const restartNotices = new RestartNoticeService(
  () => Storage.getStorage(), new DaemonNoticeTransport(),
  (error) => logger.warn("[RestartNotice]", error)
);
