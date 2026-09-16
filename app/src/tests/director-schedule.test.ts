import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { listDirectorSchedule, createDirectorSchedule, deleteDirectorSchedule } from "@/lib/harness/directorSchedule";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("부서장 일정 (018-C)", () => {
  it("부서장 일정 등록 → 목록 조회", async () => {
    const item = await createDirectorSchedule({ date: "2026-09-18", time: "09:30", title: "심사 회의", note: "주간 현안" }, "user-1");
    expect(item.title).toBe("심사 회의");
    const list = await listDirectorSchedule();
    expect(list.some(x => x.id === item.id)).toBe(true);
  });

  it("일정 삭제", async () => {
    const item = await createDirectorSchedule({ date: "2026-09-20", title: "삭제 테스트" });
    expect(await deleteDirectorSchedule(item.id)).toBe(true);
    expect(await deleteDirectorSchedule(item.id)).toBe(false);
  });
});
