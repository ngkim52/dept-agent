// 채팅 답변 위에 붙이는 "부장님 의견" 생성 (018-채팅)
// - 지식 나열이 아니라, 진짜 부서장이 부서원에게 직접 하는 의견·지시(2~4문장)
// - RAG 지식 + 부서장 일정 참고, 상황에 따라 회의 제안 / 대시보드 일감 등록 / 동료 논의 권유
import { listDirectorSchedule } from "@/lib/harness/directorSchedule";

export type DirectorAdviceInput = {
  question: string;
  ragContent?: string;
};

export function buildDirectorAdvicePrompt(input: DirectorAdviceInput, schedule: string): string {
  return [
    "당신은 보험금기획 부서장입니다. 직원의 질문에 대한 지식 답변 위에, 진짜 부서장이 부서원에게 직접 하는 짧은 의견·지시(2~4문장)를 한국어로 작성하세요.",
    "단순 지식 나열은 금지입니다. 질문 내용과 관련 지식, 부서장 일정을 근거로 아래처럼 상황에 맞는 실제 부서장다운 지시를 담으세요.",
    "- 업무 관련자들과 함께 풀어야 할 문제면: 관련 부서원들과 회의를 잡거나, 대시보드 일감으로 등록해 진행하라고.",
    "- 명확하지 않은 업무(이전에 처리해 본 적 없는 신규/불명확 업무)면: 빈 일정 시간에 부서장과 회의를 하자고.",
    "- 다른 부서원이 비슷한 질문/고민을 한 정황이 보이면: 그 직원과 업무에 대해 논의해 보라고.",
    "- 회의/일감 등록이 적합하지 않은 단순 문의면: 바로 처리하라고 지시하거나 부서장 결재/검토를 권하세요.",
    "",
    "[부서장 일정]",
    schedule,
    "",
    "[질문]",
    input.question,
    "",
    input.ragContent && input.ragContent.trim() ? "[관련 지식(RAG)]\n" + input.ragContent.trim() : "(관련 지식 없음)",
    "",
    "부장님 의견만 마크다운 헤더 없이 출력하세요.",
  ].join("\n");
}

/** 부장님 의견 생성 — 실패 시 빈 문자열(답변은 정상 유지) */
export async function generateDirectorAdvice(input: DirectorAdviceInput, opts: { call?: (p: string) => Promise<string> } = {}): Promise<string> {
  try {
    const scheduleRows = await listDirectorSchedule();
    const schedule = scheduleRows.length
      ? scheduleRows.map((s) => `${s.date}${s.time ? " " + s.time : ""} - ${s.title}`).join("\n")
      : "(등록된 부서장 일정 없음)";
    const prompt = buildDirectorAdvicePrompt(input, schedule);
    let raw: string;
    if (opts.call) {
      raw = (await opts.call(prompt)).trim();
    } else {
      const { getLlmModel } = await import("@/lib/agent/llm");
      const { models, model } = await getLlmModel("simple");
      const res = await models.completeSimple(model, {
        systemPrompt: "당신은 보험금기획 부서장입니다. 부서장의 직접적인 의견·지시를 한국어로 작성합니다.",
        messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
      });
      raw = (res?.content ?? [])
        .filter((t: any) => t?.type === "text")
        .map((t: any) => t.text)
        .join("")
        .trim();
    }
    return raw.replace(/^#{1,3}\s*/, "").trim();
  } catch {
    return "";
  }
}

export const DIRECTOR_ADVICE_HEADING = "### 🎙️ 부장님 의견";
