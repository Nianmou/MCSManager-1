import type { NewScheduleTask, Schedule, ScheduleTaskForm } from "@/types";
import dayjs from "dayjs";
import { t } from "@/lang/i18n";

export function newRestartNoticePayload() {
  return JSON.stringify({ seconds: 15, message: t("TXT_CODE_restartNotice.defaultMessage") });
}
export function restartNoticeFields(payload: string): { seconds: number; message: string } {
  try { return JSON.parse(payload); } catch { return { seconds: 15, message: "" }; }
}
export function validRestartNoticePayload(payload: string): boolean {
  if (payload.length > 1400) return false;
  const value = restartNoticeFields(payload);
  return value != null && Number.isInteger(value.seconds) && value.seconds >= 10 && value.seconds <= 3600 &&
    typeof value.message === "string" && !!value.message.trim() && value.message.length <= 200 &&
    !/[\x00-\x1f\x7f-\x9f]/.test(value.message);
}

export type SchedulePayload = NewScheduleTask & Pick<Schedule, "actions">;

export function newScheduleDraft(): ScheduleTaskForm {
  return {
    name: "",
    count: 0,
    type: 1,
    time: "",
    actions: [{ type: "command", payload: "" }],
    weekend: [],
    cycle: ["0", "0", "0"],
    objTime: dayjs()
  };
}

export function scheduleToDraft(task: Schedule): ScheduleTaskForm {
  const draft = { ...newScheduleDraft(), ...task, actions: task.actions.map((a) => ({ ...a })) };
  draft.count = Number(task.count) === -1 ? "" : Number(task.count);
  if (task.type === 1) {
    const seconds = Number(task.time);
    draft.cycle = [seconds % 60, Math.floor((seconds % 3600) / 60), Math.floor(seconds / 3600)].map(
      String
    );
  } else {
    const [s, m, h, d, month, week] = task.time.split(" ");
    draft.objTime = dayjs().hour(Number(h)).minute(Number(m)).second(Number(s));
    if (task.type === 2) draft.weekend = week.split(",").map(Number);
    else
      draft.objTime = draft.objTime
        .date(1)
        .month(Number(month) - 1)
        .date(Number(d));
  }
  return draft;
}

// Keep the daemon's cron format and recurrence semantics unchanged.
export function serializeSchedule(draft: ScheduleTaskForm): SchedulePayload {
  let time: string;
  if (draft.type === 1) {
    time = String(
      Number(draft.cycle[0]) + Number(draft.cycle[1]) * 60 + Number(draft.cycle[2]) * 3600
    );
  } else {
    const date = draft.objTime;
    time = `${date.second()} ${date.minute()} ${date.hour()} `;
    time +=
      draft.type === 2 ? `* * ${draft.weekend.join(",")}` : `${date.date()} ${date.month() + 1} *`;
  }
  return {
    name: draft.name,
    type: draft.type,
    time,
    count: Number(draft.count) || -1,
    actions: draft.actions.map((action) => ({ ...action }))
  };
}

export function validScheduleDraft(draft: ScheduleTaskForm): boolean {
  const count = Number(draft.count) || -1;
  if (!draft.name.trim() || /[\\/:*?"'<>|.\x00-\x1f]/.test(draft.name)) return false;
  if (!Number.isInteger(count) || (count !== -1 && count < 1)) return false;
  if (!draft.actions.length || draft.actions.length > 10) return false;
  if (
    draft.actions.some(
      (a) => !["start", "stop", "restart", "restart_notice", "kill", "delay", "command"].includes(a.type) ||
        (a.type === "restart_notice" && !validRestartNoticePayload(a.payload))
    )
  )
    return false;
  if (draft.type === 1) {
    const seconds = Number(serializeSchedule(draft).time);
    return (
      draft.cycle.every((v) => Number.isFinite(Number(v)) && Number(v) >= 0) &&
      Number.isFinite(seconds) &&
      seconds >= 3
    );
  }
  if (!draft.objTime?.isValid()) return false;
  if (draft.type === 2)
    return (
      draft.weekend.length > 0 &&
      draft.weekend.every((v) => Number.isInteger(v) && v >= 0 && v <= 7)
    );
  return draft.type === 3;
}
