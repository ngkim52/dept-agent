import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { createWorkTask, listWorkTasks, updateWorkTask, taskStats, reportNotice, getWorkTask, deleteWorkTask, completeWorkTask, dueWithinDays, normalizeDate } from "@/lib/harness/workQueue";
import { listMemories } from "@/lib/harness/store";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("부서 워크큐 (018-B)", () => {
  it("일감 생성 → 목록/단건 조회 + 기본값", async () => {
    const t = await createWorkTask({ personaKey: "claims-planning", title: "손해율 목표 관리", assignee: "김심사", dueDate: "2026-09-25", category: "월간" }, "user-1");
    expect(t.id).toBeTruthy();
    expect(t.status).toBe("todo");
    expect(t.progress).toBe(0);
    expect(t.status).toBe("todo");
    const list = await listWorkTasks({ personaKey: "claims-planning" });
    expect(list).toHaveLength(1);
    expect((await getWorkTask(t.id))!.title).toBe("손해율 목표 관리");
  });

  it("진행률/상태 갱신 + 통계", async () => {
    const t = await createWorkTask({ personaKey: "claims-planning", title: "9월 손해율 점검" }, "user-1");
    await updateWorkTask(t.id, { progress: 50, status: "doing", content: "주간 업무 2주차" });
    const u = (await getWorkTask(t.id))!;
    expect(u.progress).toBe(50);
    expect(u.status).toBe("doing");
    const st = await taskStats("claims-planning");
    expect(st.total).toBe(1);
    expect(st.doing).toBe(1);
    expect(st.avgProgress).toBe(50);
  });

  it("지연 일감은 서면보고 지시 문구 생성", async () => {
    const t = await createWorkTask({ personaKey: "claims-planning", title: "실손 마감", assignee: "박계리" }, "user-1");
    await updateWorkTask(t.id, { status: "delayed" });
    const d = reportNotice((await getWorkTask(t.id))!);
    expect(d).toContain("지연");
    expect(d).toContain("박계리");
    expect(d).toContain("서면 보고");
  });

  it("진행내용은 DB에만 저장(ragSynced=false) — RAG 미등록", async () => {
    const t = await createWorkTask({ personaKey: "claims-planning", title: "진단 3일 내 처리", content: "전 산정 부분 일괄 정비", dueDate: "2026-09-20" }, "user-1");
    expect(t.content).toBe("전 산정 부분 일괄 정비");
    expect((await getWorkTask(t.id))!.content).toBe("전 산정 부분 일괄 정비");
    // RAG가 아닌 DB(work_tasks)에만 저장
    expect(t.ragSynced).toBe(false);
  });
  it("부서장 의견 항목칩 중복 등록 방지 — 같은 제목이면 재생성하지 않음", async () => {
    const t1 = await createWorkTask({ personaKey: "claims-planning", title: "진단 심사 단축", source: "director_note" }, "user-1");
    const t2 = await createWorkTask({ personaKey: "claims-planning", title: "진단 심사 단축", source: "director_note" }, "user-1");
    expect(t2.id).toBe(t1.id);
    expect((await listWorkTasks({ personaKey: "claims-planning" })).length).toBe(1);
  });

  it("부서장 의견 항목칩과 일반 생성은 제목 같아도 구분(서로 다른 일감 허용)", async () => {
    const t1 = await createWorkTask({ personaKey: "claims-planning", title: "손해율 목표", source: "director_note" }, "user-1");
    const t2 = await createWorkTask({ personaKey: "claims-planning", title: "손해율 목표" }, "user-1");
    expect(t2.id).not.toBe(t1.id);
    expect((await listWorkTasks({ personaKey: "claims-planning" })).length).toBe(2);
  });
  it("일감 삭제", async () => {
    const t = await createWorkTask({ personaKey: "claims-planning", title: "삭제할 일감" }, "user-1");
    expect(await deleteWorkTask(t.id)).toBe(true);
    expect(await deleteWorkTask(t.id)).toBe(false);
    expect((await listWorkTasks({ personaKey: "claims-planning" })).length).toBe(0);
  });
  it("다가오는 마감은 등록 일감 기준 1주일 이내 + 지연분만 반환, 기한순 정렬", () => {
    const now = new Date(2026, 8, 10); // 2026-09-10
    const mk = (p: any) => ({ id: p.title, title: p.title, dueDate: p.dueDate ?? null, status: p.status ?? "todo", progress: 0, assignee: p.assignee ?? null, category: p.category ?? null } as any);
    const tasks = [
      mk({ title: "오늘", dueDate: "2026-09-10" }),
      mk({ title: "3일 후", dueDate: "2026-09-13" }),
      mk({ title: "10일 후(제외)", dueDate: "2026-09-20" }),
      mk({ title: "지연", dueDate: "2026-09-08" }),
      mk({ title: "완료(제외)", dueDate: "2026-09-12", status: "done" }),
      mk({ title: "기한 없음(제외)", dueDate: null }),
    ];
    const view = dueWithinDays(tasks, 7, now);
    const titles = view.map(v => v.task.title);
    expect(titles).toEqual(["지연", "오늘", "3일 후"]);
    expect(view.find(v => v.task.title === "지연")!.overdue).toBe(true);
    expect(view.find(v => v.task.title === "3일 후")!.daysLeft).toBe(3);
  });
  it("다가오는 마감: YYYYMMDD(구분자 없는) 마감일도 1주일 이내로 인식", () => {
    const now = new Date(2026, 8, 16); // 2026-09-16
    const mk = (p: any) => ({ id: p.title, title: p.title, dueDate: p.dueDate ?? null, status: p.status ?? "todo", progress: 0, assignee: p.assignee ?? null, category: p.category ?? null } as any);
    const task = mk({ title: "수동심사 개선", dueDate: "20260918" });   // 2026-09-18 = D-2
    const view = dueWithinDays([task], 7, now);
    expect(view.length).toBe(1);
    expect(view[0].task.title).toBe("수동심사 개선");
    expect(view[0].daysLeft).toBe(2);
    expect(normalizeDate("20260918")).toBe("2026-09-18");
  });

  it("완료 처리: status=done, progress=100 + RAG 업무 히스토리(지식 메모리) 저장", async () => {
    const t = await createWorkTask({ personaKey: "claims-planning", title: "9월 손해율 정산", assignee: "이실무", dueDate: "2026-09-22", content: "정산 마감 완료" }, "user-1");
    const res = await completeWorkTask(t.id, { changedBy: "user-1" });
    expect(res!.status).toBe("done");
    expect(res!.progress).toBe(100);
    const mems = await listMemories("claims-planning");
    const hist = mems.find(m => (m.tags ?? "").includes("업무히스토리"));
    expect(hist).toBeTruthy();
    expect(hist!.content).toContain("9월 손해율 정산");
    expect(hist!.content).toContain("정산 마감 완료");
  });
});
