import { describe, expect, it, vi } from "vitest";
import dayjs from "dayjs";
import {
  newScheduleDraft,
  scheduleToDraft,
  serializeSchedule,
  validScheduleDraft,
  newRestartNoticePayload
} from "../schedule";
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));

describe("schedule drafts", () => {
  it("starts notified restarts at 15 seconds and preserves their payload through editing", () => {
    const draft = newScheduleDraft(); draft.name = "restart"; draft.cycle = ["30", "0", "0"];
    draft.actions = [{ type: "restart_notice", payload: newRestartNoticePayload() }];
    expect(JSON.parse(draft.actions[0].payload).seconds).toBe(15);
    expect(validScheduleDraft(draft)).toBe(true);
    const payload = serializeSchedule(draft);
    expect(serializeSchedule(scheduleToDraft({ ...payload, instanceUuid: "id" }))).toEqual(payload);
    for (const value of ["{}", "null", "bad", JSON.stringify({ seconds: 9, message: "test" }),
      JSON.stringify({ seconds: 15, message: "bad\n" })]) {
      draft.actions[0].payload = value; expect(validScheduleDraft(draft)).toBe(false);
    }
  });
  it("serializes intervals without mutating drafts or sharing actions", () => {
    const draft = newScheduleDraft();
    draft.name = "daily";
    draft.cycle = ["3", "2", "1"];
    const payload = serializeSchedule(draft);
    expect(payload.time).toBe("3723");
    expect(payload.count).toBe(-1);
    expect(draft.count).toBe(0);
    payload.actions[0].payload = "changed";
    expect(draft.actions[0].payload).toBe("");
    expect(newScheduleDraft().actions[0].payload).toBe("");
  });
  it("round trips cycle and specified cron formats with finite counts", () => {
    for (const type of [2, 3]) {
      const draft = newScheduleDraft();
      Object.assign(draft, {
        type,
        count: 4,
        weekend: [1, 7],
        objTime: dayjs("2026-10-24T12:34:56")
      });
      draft.actions = [
        { type: "delay", payload: "1000" },
        { type: "restart", payload: "" }
      ];
      const payload = serializeSchedule(draft);
      expect(payload.time).toBe(type === 2 ? "56 34 12 * * 1,7" : "56 34 12 24 10 *");
      expect(serializeSchedule(scheduleToDraft({ ...payload, instanceUuid: "id" }))).toEqual(
        payload
      );
    }
  });
  it("validates names, action limits, minimum intervals, weekdays and counts", () => {
    const draft = newScheduleDraft();
    draft.name = "safe";
    draft.cycle = ["3", "0", "0"];
    expect(validScheduleDraft(draft)).toBe(true);
    expect(validScheduleDraft({ ...draft, name: "../unsafe" })).toBe(false);
    expect(validScheduleDraft({ ...draft, cycle: ["2", "0", "0"] })).toBe(false);
    expect(validScheduleDraft({ ...draft, count: -2 })).toBe(false);
    expect(validScheduleDraft({ ...draft, actions: Array(11).fill(draft.actions[0]) })).toBe(false);
    expect(validScheduleDraft({ ...draft, type: 2, weekend: [] })).toBe(false);
    expect(validScheduleDraft({ ...draft, type: 2, weekend: [1] })).toBe(true);
  });
});
