import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { createWorkTask, listWorkTasks, updateWorkTask, taskStats, reportNotice, getWorkTask, deleteWorkTask } from "@/lib/harness/workQueue";

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
});
