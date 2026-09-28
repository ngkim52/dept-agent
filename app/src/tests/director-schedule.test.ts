import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { listDirectorSchedule, createDirectorSchedule, updateDirectorSchedule, deleteDirectorSchedule } from "@/lib/harness/directorSchedule";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("부서장 일정 (018-C)", () => {
  it("부서장 일정 등록 → 목록 조회", async () => {
    const item = await createDirectorSchedule({ date: "2026-09-18", time: "09:30", title: "심사 회의", note: "주간 현안" }, "user-1");
    expect(item.title).toBe("심사 회의");
    const list = await listDirectorSchedule();
    expect(list.some(x => x.id === item.id)).toBe(true);
  });

  it("일정 등록 시 참석자·장소 저장", async () => {
    const item = await createDirectorSchedule({ date: "2026-09-21", time: "14:00", title: "주간회의", attendees: "김부장, 박과장", location: "3층 회의실" }, "user-1");
    expect(item.attendees).toBe("김부장, 박과장");
    expect(item.location).toBe("3층 회의실");
  });

  it("일정 수정 — 제목·참석자·장소 변경 + 없는 id는 null", async () => {
    const item = await createDirectorSchedule({ date: "2026-09-22", time: "10:00", title: "원래 제목", attendees: "A", location: "1층" }, "user-1");
    const updated = await updateDirectorSchedule(item.id, { title: "바뀐 제목", attendees: "B, C", location: "5층 대회의실" });
    expect(updated?.title).toBe("바뀐 제목");
    expect(updated?.attendees).toBe("B, C");
    expect(updated?.location).toBe("5층 대회의실");
    expect(updated?.date).toBe("2026-09-22");
    expect(await updateDirectorSchedule("없는-id", { title: "x" })).toBeNull();
  });

  it("일정 삭제", async () => {
    const item = await createDirectorSchedule({ date: "2026-09-20", title: "삭제 테스트" });
    expect(await deleteDirectorSchedule(item.id)).toBe(true);
    expect(await deleteDirectorSchedule(item.id)).toBe(false);
  });
});
