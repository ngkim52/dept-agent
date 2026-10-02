import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EmotionPanel from "@/app/(app)/debate/[id]/EmotionPanel";
import { buildEmotionFlow } from "@/lib/debate/report";

const participants = [
  { key: "critic", name: "냉철한 비판가 에이전트", emoji: "🧊", color: "#3A3A3A", role: "리스크 비판", kind: "member" },
  { key: "optimist", name: "긍정적 에이전트", emoji: "🌤", color: "#B07A16", role: "기회 탐색", kind: "member" },
  { key: "synthesizer", name: "최종 결론 에이전트", emoji: "📌", color: "#1F6C9F", role: "사회·결론", kind: "conclusion" },
];
const msg = (seq: number, key: string, name: string, round: number, state: Partial<{ emotion: string; satisfaction: number; stance: string; innerThought: string }>) => ({
  id: "m" + seq, seq, personaKey: key, personaName: name, personaEmoji: "🧊", personaColor: "#333",
  kind: "member", round, content: "발언 " + seq, createdAt: "2026-10-01T00:00:00.000Z", ...state,
});

describe("참가자 감정·속마음 섹션", () => {
  it("발언 로그에서 참가자별 만족도/감정/속마음 흐름을 만든다", () => {
    const flow = buildEmotionFlow([
      msg(1, "critic", "냉철한 비판가 에이전트", 1, { emotion: "우려", satisfaction: 40, stance: "조건부", innerThought: "근거가 약하다" }),
      msg(2, "critic", "냉철한 비판가 에이전트", 2, { emotion: "중립", satisfaction: 55, stance: "조건부", innerThought: "조금 나아졌다" }),
      msg(3, "optimist", "긍정적 에이전트", 1, { emotion: "기대", satisfaction: 80, stance: "찬성", innerThought: "밀어붙이자" }),
    ] as any);
    const critic = flow.find((f) => f.persona === "냉철한 비판가 에이전트")!;
    expect(critic.series).toEqual([40, 55]);
    expect(critic.lastThought).toBe("조금 나아졌다");
    expect(critic.stance).toBe("조건부");
    expect(flow.map((f) => f.persona)).toContain("긍정적 에이전트");
  });

  it("패널은 이름·감정·입장·만족도·속마음을 별도 섹션으로 렌더링한다", () => {
    const html = renderToStaticMarkup(createElement(EmotionPanel, {
      participants: participants as any, status: "running",
      messages: [
        msg(1, "critic", "냉철한 비판가 에이전트", 1, { emotion: "우려", satisfaction: 40, stance: "조건부", innerThought: "근거가 약하다" }),
        msg(2, "optimist", "긍정적 에이전트", 1, { emotion: "기대", satisfaction: 80, stance: "찬성", innerThought: "밀어붙이자" }),
      ] as any,
    }));
    expect(html).toContain("참가자 감정 · 속마음");
    expect(html).toContain("냉철한 비판가 에이전트");
    expect(html).toContain("우려");
    expect(html).toContain("조건부");
    expect(html).toContain("근거가 약하다");
    expect(html).toContain("80");
    expect(html).not.toContain("최종 결론 에이전트"); // 결론 에이전트는 참가자 패널에서 제외
  });
});

// ── 관전 화면 정렬: 토론창과 감정 섹션이 같은 높이 + 각자 내부 스크롤 ──
import DebateStage from "@/app/(app)/debate/[id]/DebateStage";

const HEIGHT = "h-[68vh] min-h-[420px]";
const LG_HEIGHT = "lg:h-[72vh] lg:min-h-[560px]";

describe("관전 화면 레이아웃", () => {
  it("토론창과 감정 섹션의 높이가 동일하고 각각 스크롤된다", () => {
    const stageHtml = renderToStaticMarkup(createElement(DebateStage, {
      messages: [] as any, participants: participants.slice(0, 2) as any, currentSpeakerKey: "critic", typing: false,
    }));
    const panelHtml = renderToStaticMarkup(createElement(EmotionPanel, {
      participants: participants as any, messages: [] as any, status: "running",
    }));
    for (const html of [stageHtml, panelHtml]) {
      expect(html).toContain(HEIGHT);
      expect(html).toContain(LG_HEIGHT);
      expect(html).toContain("overflow-y-auto");
      expect(html).toContain("debate-scroll");
    }
  });

  it("감정 섹션은 남는 공간만 스크롤한다(헤더 고정)", () => {
    const html = renderToStaticMarkup(createElement(EmotionPanel, { participants: participants as any, messages: [] as any, status: "running" }));
    expect(html).toContain("flex-1");
    expect(html).toContain("min-h-0");
    expect(html).toContain("shrink-0");
  });
});

// ── 관전 화면 폭: 넓은 컨테이너 + 좌측(토론창) 우선 그리드 ──
import { readFileSync } from "node:fs";
import path from "node:path";

describe("관전 화면 폭", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/(app)/debate/[id]/DebateRoom.tsx"), "utf8");
  it("컨테이너를 넓게 쓰고, 토론창이 우측 패널보다 넓은 그리드를 쓴다", () => {
    expect(src).toContain("max-w-[1440px]");
    expect(src).not.toContain("max-w-5xl");
    expect(src).toContain("xl:grid-cols-[minmax(0,1fr)_320px]");
  });
});

describe("DebateStage 중복 방어", () => {
  it("같은 id 가 두 번 들어와도 한 번만 렌더링한다(중복 키 에러 방지)", () => {
    const dup = {
      id: "dup-1", seq: 1, personaKey: "critic", personaName: "냉철한 비판가 에이전트", personaEmoji: "🧊",
      personaColor: "#333", kind: "member", round: 1, content: "중복 메시지", createdAt: "2026-10-01T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(createElement(DebateStage, {
      messages: [dup, { ...dup }] as any, participants: participants.slice(0, 2) as any, currentSpeakerKey: "critic", typing: false,
    }));
    expect(html.split("중복 메시지").length - 1).toBe(1);
  });
});
