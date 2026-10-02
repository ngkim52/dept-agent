// 지식 하네스 — Q&A 압축(compact) 파이프라인
// compact 모델로 부서원 대화 묶음을 "질문 요약 + 결론 + 재사용 규칙"으로 추출한다.
import { getLlmModel } from "@/lib/agent/llm";
import { parseJsonLoose } from "@/lib/util/jsonLoose";

export interface EpisodeQa {
  messageId: string;
  role: "user" | "assistant";
  content: string;
}

export interface EpisodeExtraction {
  summary: string;
  conclusion: string;
  reusable_rules: string[];
}

export type CompactCall = (prompt: string) => Promise<string>;

const SYSTEM = `당신은 부서원 Q&A를 분석해 재사용 가능한 지식으로 압축하는 요약기입니다.
주어진 대화에서 다음을 추출해 반드시 유효한 JSON으로만 응답하세요:
- summary: 부서원들이 무엇을 물었는지 한두 문장으로 요약
- conclusion: 재사용 가치가 있는 결론/권고 본문 (스킬·프롬프트·메모리로 저장 가능한 판단 기준)
- reusable_rules: 결론을 뒷받침하는 구체적 규칙 문자열 배열 (없으면 빈 배열)
응답은 코드 블록이나 설명 없이 JSON 객체 하나만 출력합니다.`;

export function buildEpisodePrompt(departName: string, transcript: string): string {
  return `대상 부서: ${departName}\n\n대화 기록:\n${transcript}\n\n위 대화를 분석해 JSON으로 요약하세요.`;
}

/** LLM 호출 기본 구현 — UI 설정의 compact 모델 사용 */
export async function realCompactCall(prompt: string): Promise<string> {
  const { models, model } = await getLlmModel("compact");
  const res = await models.completeSimple(model, {
    systemPrompt: SYSTEM,
    messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
  });
  const text = (res?.content ?? [])
    .filter((t: any) => t?.type === "text")
    .map((t: any) => t.text)
    .join("");
  if (!text) throw new Error("compact 모델 응답이 비어 있습니다.");
  return text;
}

/** 프롬프트 → JSON 파싱 (코드블록·잡음 제거 + 콤마 누락·잘림 복원) */
export function parseEpisodeJson(raw: string): EpisodeExtraction {
  const parsed = parseJsonLoose<Record<string, unknown>>(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("compact 모델 응답에서 JSON 객체를 찾지 못했습니다.");
  }
  return {
    summary: String(parsed.summary ?? ""),
    conclusion: String(parsed.conclusion ?? ""),
    reusable_rules: Array.isArray(parsed.reusable_rules) ? parsed.reusable_rules.map(String) : [],
  };
}

/** 대화 메시지 묶음을 압축해 EpisodeExtraction 생성 */
export async function extractEpisode(qas: EpisodeQa[], departName: string, call: CompactCall = realCompactCall): Promise<EpisodeExtraction> {
  const transcript = qas
    .map((q) => `[${q.role === "user" ? "질문" : "답변"}] ${q.content}`)
    .join("\n\n");
  const prompt = buildEpisodePrompt(departName, transcript);
  const raw = await call(prompt);
  return parseEpisodeJson(raw);
}
