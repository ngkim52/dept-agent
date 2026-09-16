import { describe, it, expect } from "vitest";
import { buildMonitorOpinionPrompt, parseMonitorOpinions, OPINION_NO_RAG_FALLBACK } from "@/lib/dashboard/monitorOpinions";

describe("업무진도 모니터링 일감별 부서장 의견 (018-C)", () => {
  const tasks = [
    { title: "수동심사 우선순위 개선", status: "doing", assignee: "김남길", dueDate: "2026-09-18", progress: 40, dueLeft: 2 },
    { title: "지급 심사분 일괄 정비", status: "done", assignee: "박진아", dueDate: "2026-09-15", progress: 100, dueLeft: -1 },
  ];
  const schedule = [{ date: "2026-09-18", time: "10:00", title: "심사 회의" }];

  it("프롬프트에 일감·부서장 일정 포함", () => {
    const p = buildMonitorOpinionPrompt(tasks as any, schedule);
    expect(p).toContain("수동심사 우선순위 개선");
    expect(p).toContain("지급 심사분 일괄 정비");
    expect(p).toContain("심사 회의");
    expect(p).toContain("status=done");
  });

  it("LLM 응답 파싱 — 종료 일감 보고 시간 매핑", () => {
    const raw = JSON.stringify([
      { title: "수동심사 우선순위 개선", opinion: "담당자가 진행 중이니 일정에 맞추어 마무리하세요." },
      { title: "지급 심사분 일괄 정비", opinion: "완료는 훌륭합니다. 부서장 일정과 겹치지 않는 시간에 보고하세요.", reportTime: "14:00" },
    ]);
    const out = parseMonitorOpinions(raw, tasks as any);
    expect(out.length).toBe(2);
    const done = out.find(o => o.title === "지급 심사분 일괄 정비");
    expect(done!.reportTime).toBe("14:00");
    expect(done!.status).toBe("done");
  });

  it("RAG 자료 없음 시 결과 보고 지시 기본 문구 사용", () => {
    expect(OPINION_NO_RAG_FALLBACK).toContain("결과 보고");
  });
});
