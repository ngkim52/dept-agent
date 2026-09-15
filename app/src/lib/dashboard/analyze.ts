// 대시보드 KPI 현황 분석 — cheap 모델로 현황별 시사점 생성
import { getLlmModel } from "@/lib/agent/llm";
import type { Kpi } from "./kpis";

export async function analyzeKpis(kpis: Kpi[]): Promise<{ summary: string; perKpi: { key: string; insight: string }[] }> {
  const rows = kpis.map(k => `${k.label}(${k.dept}): 실적 ${k.value}${k.unit} / 목표 ${k.target}${k.unit} / 기준 ${k.baseline}${k.unit} / ${k.note}`).join("\n");
  const prompt = `다음은 부서 업무 KPI 현황입니다.\n${rows}\n\n위 현황을 분석해 주세요.\n1) 전체 요약(2~3문장)\n2) 각 KPI별 핵심 시사점과 권고(최대 2문장)를 "KPI명: 시사점" 형식의 줄바꿈 목록으로\n국문으로 간결하게 출력하세요.`;

  try {
    const { models, model } = await getLlmModel("simple");
    const res = await models.completeSimple(model, { messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }] });
    const text = (res?.content ?? []).filter((t: any) => t?.type === "text").map((t: any) => t.text).join("").trim();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const summary = lines.find(l => !l.includes(":")) ?? lines[0] ?? "분석 결과가 없습니다.";
    const perKpi = kpis.map(k => ({
      key: k.key,
      insight: lines.find(l => l.startsWith(k.label) || l.includes(k.label))?.replace(/^[^-:]*[:\-]\s*/, "") ?? k.note,
    }));
    return { summary, perKpi };
  } catch {
    // LLM 미구성 시 휴리스틱 해석
    const perKpi = kpis.map(k => {
      const over = k.goodWhen === "down" ? k.value > k.target : k.value < k.target;
      return { key: k.key, insight: over ? ("목표(" + k.target + k.unit + ") 대비 " + (k.goodWhen === "down" ? "상회 — 원인 분석 필요" : "미달 — 개선 조치 권고") + ".") : "목표를 충족하고 있습니다." };
    });
    return { summary: "LLM 분석이 비활성 상태입니다. KPI별 실적 대비 목표 충족 여부를 기준으로 개괄한 결과입니다.", perKpi };
  }
}
