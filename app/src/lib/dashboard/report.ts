// 보고서 초안 (컨셈§11) — 대화 → 보고서 골격 자동 구성 (Human-in-the-loop: 확정=부장)
export type ReportSection = "상황" | "분석" | "평가·결론" | "권고안" | "후속조치";

export type ReportDraft = {
  title: string;
  sections: { id: ReportSection; content: string }[];
  sourceCount: number;
  createdAt: string;
  status: "초안";
};

export function buildReportDraft(messages: { role: string; content: string }[], date = new Date().toISOString()): ReportDraft {
  const userMsgs = messages.filter((m) => m.role === "user");
  const asstMsgs = messages.filter((m) => m.role === "assistant");
  const firstUser = userMsgs[0]?.content ?? "";
  const title = (firstUser.length > 30 ? firstUser.slice(0, 30) + "…" : firstUser) || "업무 검토 보고서";
  return {
    title,
    status: "초안",
    createdAt: date,
    sourceCount: asstMsgs.length,
    sections: [
      { id: "상황", content: userMsgs.slice(0, 3).map((m) => "· " + m.content).join("\n") || "· (대화 내역 없음)" },
      { id: "분석", content: "· 검토 범위/요청 사항에 대한 분석 요약을 기입한다." },
      { id: "평가·결론", content: "· 부장(Persona) 판단 기준(권한 범위·우선순위 사다리)에 따른 잠정 결론을 기입한다." },
      { id: "권고안", content: "· 실행 가능한 권고를 기입한다. (Human-in-the-loop로 서술 확정)" },
      { id: "후속조치", content: "· 후속 액션·담당자를 기입한다." },
    ],
  };
}
