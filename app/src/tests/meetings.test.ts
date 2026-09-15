
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { draftMinutes, createMeeting, applyMeetingAsKnowledge, listMeetings, parseMinutesMarkdown, minutesToMarkdown } from "@/lib/meetings";
import { listEdges } from "@/lib/harness/review";
import { listMemories } from "@/lib/harness/store";

beforeEach(async () => { await resetDb(); await withDept(); });

const RAW = `참석: 김부장, 이과장, 박대리
안건: 손해율 개선 방안
안건: 자동심사 대상 확대
결정: 300만원 이하 실손 자동심사 대상 확대 확정
액션: 대상 목록 정리 | 이과장 | 2월 말
리스크: 역선택 증가 우려`;

describe("회의록 → 지식 적재 (015-F4)", () => {
  it("원문 → 회의록 초안 휴리스틱 파싱", () => {
    const { minutes } = draftMinutes(RAW);
    expect(minutes.attendees).toContain("김부장");
    expect(minutes.agenda.length).toBe(2);
    expect(minutes.decisions.some((d) => d.includes("자동심사"))).toBe(true);
    expect(minutes.actions[0].owner).toBe("이과장");
    expect(minutes.actions[0].due).toBe("2월 말");
    expect(minutes.risk.some((r) => r.includes("역선택"))).toBe(true);
  });

  it("저장 후 지식 적재 → 메모리 생성 + 그래프 엣지 meeting→memory", async () => {
    const m = await createMeeting({ id: "meet-1", departmentId: "claims-planning", title: "손해율 점검 회의", rawText: RAW, minutesJson: JSON.stringify(draftMinutes(RAW).minutes) });
    expect(m.id).toBe("meet-1");
    const { memoryId } = await applyMeetingAsKnowledge(m);
    const mems = await listMemories("claims-planning");
    expect(mems.some((x) => x.id === memoryId && x.kind === "decision")).toBe(true);
    const edges = await listEdges();
    expect(edges.some((e) => e.fromType === "meeting" && e.fromId === "meet-1" && e.toId === memoryId && e.rel === "source_of")).toBe(true);
  });

  it("지식 적재 아직 안 한 회의록은 knowledgeApplied=false", async () => {
    await createMeeting({ id: "meet-2", departmentId: "claims-planning", title: "브리핑 준비", rawText: "안건: 브리핑 초안" });
    const list = await listMeetings("claims-planning");
    expect(list.find((x) => x.id === "meet-2")?.knowledgeApplied).toBe(false);
  });
});

const MD = `# 9월 손해율 점검 회의
- 날짜: 2026-09-03
- 참석: 김부장, 이과장

## 논의 내용
- 자동심사 확대 여부 검토
- 손해율이 목표보다 높은 원인 분석

## 결정 사항
- 손해율 통제를 위한 한도 강화 확정

## 후속 조치
- 한도안 작성 | 담당: 이과장 | 마감: 9/10
- 리스크 보고 | 담당: 박대리 | 마감: 9/12

## 리스크
- 역선택 증가 우려
`;

describe("회의록 · MD → RAGFlow 적재 (재설계)", () => {
  it("MD를 파싱해 날짜/참석/안건/결정/액션/리스크를 추출한다", () => {
    const { title, date, attendees, minutes } = parseMinutesMarkdown(MD);
    expect(title).toContain("손해율");
    expect(date).toBe("2026-09-03");
    expect(attendees).toContain("김부장");
    expect(minutes.agenda.length).toBe(2);
    expect(minutes.decisions.some((d) => d.includes("한도 강화"))).toBe(true);
    expect(minutes.actions[0].owner).toBe("이과장");
    expect(minutes.actions[0].due).toBe("9/10");
    expect(minutes.risk.some((r) => r.includes("역선택"))).toBe(true);
  });

  it("minutesToMarkdown 으로 MD를 재생성, 언제/논의/결과가 보존된다", () => {
    const parsed = parseMinutesMarkdown(MD);
    const md = minutesToMarkdown(parsed.minutes, { title: parsed.title, date: parsed.date, attendees: parsed.attendees });
    expect(md).toContain("# 9월 손해율 점검 회의");
    expect(md).toContain("날짜: 2026-09-03");
    expect(md).toContain("자동심사 확대 여부 검토");
    expect(md).toContain("한도 강화 확정");
    expect(md).toContain("한도안 작성");
  });
});
