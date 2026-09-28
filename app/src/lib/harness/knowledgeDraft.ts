// 지식 초안 작성기 — 대화/요청 원문을 부서 페르소나에 주입할 지식(스킬·프롬프트·메모리)으로 증류한다.
// - 생성 시 반드시 「스킬 생성기」 스킬 기반 가이드(skillGuide)를 따른다.
// - 대화 원문을 그대로 proposed_content에 넣지 않는다(대화 맥락은 source_conversation_id로 참조).
// - 실패 시 null을 돌려주고, 호출부가 안전한 폴백을 쓴다.
import { skillAuthoringGuide } from "./skillGuide";

export type DraftKind = "skill" | "prompt" | "memory";

export interface KnowledgeDraft {
  kind: DraftKind;
  name: string;          // kind=skill일 때 이름
  description: string;   // kind=skill일 때 설명(발동 조건)
  title: string;         // kind=prompt|memory일 때 제목
  content: string;       // 주입될 지식 본문
}

export type DraftCall = (prompt: string) => Promise<string>;

/** LLM 호출 기본 구현 — simple 모델 */
export async function realDraftCall(prompt: string): Promise<string> {
  const { getLlmModel } = await import("@/lib/agent/llm");
  const { models, model } = await getLlmModel("simple");
  const res = await models.completeSimple(model, {
    messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
  });
  const text = (res?.content ?? [])
    .filter((t: any) => t?.type === "text")
    .map((t: any) => t.text)
    .join("");
  if (!text) throw new Error("지식 초안 모델 응답이 비어 있습니다.");
  return text;
}

/** 코드블록·설명 제거 후 첫 JSON 객체 추출 */
function extractJson(raw: string): any | null {
  let s = (raw ?? "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

export function buildDistillPrompt(input: {
  personaKey: string;
  question: string;
  request: string;
  transcript?: string;
}): string {
  const guide = skillAuthoringGuide(input.personaKey);
  return [
    "당신은 부서 지식 하네스의 지식 작성기입니다.",
    "직원의 요청과 대화를 바탕으로, 부서 페르소나에 주입할 지식을 작성하세요.",
    "",
    guide,
    "",
    "[작성 대상]",
    `- 요청 유형: ${input.question || "(제목 없음)"}`,
    `- 요청 내용: ${input.request || "(없음)"}`,
    input.transcript ? `- 참고 대화(원문을 그대로 옮기지 말 것):\n${input.transcript}` : "",
    "",
    "작성 규칙:",
    "- 반복 업무 절차·판단 프로세스·작업 흐름이면 kind=skill 로 작성한다.",
    "- 항상 적용할 응답 규칙·말투·지침이면 kind=prompt 로 작성한다.",
    "- 사실·결정·수치 기준·선례이면 kind=memory 로 작성한다.",
    "- content는 다른 질문에도 적용 가능한 일반화된 지식으로 쓴다. 인사말·메타발언·\"확인이 필요합니다\" 같은 대화 잔여물과 원문 대화록은 넣지 않는다.",
    "- kind=skill 이면 content는 SKILL.md 본문 구조(요구 시점/판단 기준/데이터 사용/출력)를 따른다.",
    "",
    "아래 JSON만 출력하세요(설명·코드블록 없이):",
    '{"kind":"skill|prompt|memory","name":"<skill일 때 2~5단어 이름>","description":"<skill일 때 발동 조건 1~2문장>","title":"<prompt/memory일 때 짧은 제목>","content":"<주입될 지식 본문>"}',
  ].filter(Boolean).join("\n");
}

export function parseKnowledgeDraft(raw: string): KnowledgeDraft | null {
  const o = extractJson(raw);
  if (!o) return null;
  const kind = String(o.kind ?? "").toLowerCase();
  const content = String(o.content ?? "").trim();
  if (!content) return null;
  if (kind !== "skill" && kind !== "prompt" && kind !== "memory") return null;
  const name = String(o.name ?? "").trim();
  const description = String(o.description ?? "").trim();
  const title = String(o.title ?? o.name ?? "").trim();
  if (kind === "skill" && (!name || !description)) return null;
  return { kind, name, description, title, content };
}

/** 대화/요청 → 지식 초안(스킬·프롬프트·메모리). LLM 실패 시 null */
export async function distillKnowledgeDraft(
  input: { personaKey: string; question: string; request: string; transcript?: string },
  call: DraftCall = realDraftCall,
): Promise<KnowledgeDraft | null> {
  try {
    const raw = await call(buildDistillPrompt(input));
    return parseKnowledgeDraft(raw);
  } catch { return null; }
}

/* ---------------- 스킬 후보 판정 (추출된 지식 → 스킬 후보) ---------------- */

export interface SkillWorthyItem { content: string }

export function buildSkillCandidatePrompt(personaKey: string, items: SkillWorthyItem[]): string {
  const guide = skillAuthoringGuide(personaKey);
  const list = items.map((it, i) => `${i + 1}. ${it.content}`).join("\n");
  return [
    "당신은 부서 지식 하네스의 스킬 설계자입니다.",
    "아래 추출된 지식 중, 반복 업무 절차·판단 프로세스·작업 흐름에 해당해 '스킬'로 만들 가치가 있는 것만 골라 스킬 초안을 작성하세요.",
    "단순 사실·수치·선례·말투 규칙은 스킬로 만들지 마세요(제외).",
    "",
    guide,
    "",
    "[추출된 지식]",
    list,
    "",
    "아래 JSON만 출력하세요(설명·코드블록 없이). 스킬로 만들 것이 없으면 {\"skills\":[]} 만 출력하세요:",
    '{"skills":[{"name":"<2~5단어 이름>","description":"<발동 조건 1~2문장>","content":"<SKILL.md 본문>"}]}',
  ].join("\n");
}

export function parseSkillCandidates(raw: string): { name: string; description: string; content: string }[] {
  const o = extractJson(raw);
  if (!o || !Array.isArray(o.skills)) return [];
  return o.skills
    .filter((s: any) => s && String(s.content ?? "").trim())
    .map((s: any) => ({
      name: String(s.name ?? "").trim() || "새 스킬",
      description: String(s.description ?? "").trim(),
      content: String(s.content).trim(),
    }));
}

/** 추출 지식 → create_skill 후보 생성. call 없거나 실패하면 아무 것도 만들지 않는다. */
export async function createSkillCandidatesFromKnowledge(
  personaKey: string,
  items: SkillWorthyItem[],
  opts: { sourceKind: "admin_chat" | "episode"; sourceId: string; confidence?: number; call?: DraftCall } = { sourceKind: "admin_chat", sourceId: "" },
): Promise<{ createdCount: number }> {
  const contents = items.map((i) => i.content).filter((c) => c && c.trim());
  if (!contents.length) return { createdCount: 0 };
  const call = opts.call ?? realDraftCall;
  let drafts: { name: string; description: string; content: string }[] = [];
  try {
    drafts = parseSkillCandidates(await call(buildSkillCandidatePrompt(personaKey, contents.map((content) => ({ content })))));
  } catch { drafts = []; }
  if (!drafts.length) return { createdCount: 0 };

  const { createCandidate, listCandidates } = await import("./review");
  let createdCount = 0;
  const existing = await listCandidates({ personaKey, status: "pending" });
  for (const d of drafts) {
    const dup = existing.some((c) => c.sourceId === opts.sourceId && (c.proposedContent ?? "").trim() === d.content.trim());
    if (dup) continue;
    await createCandidate({
      personaKey,
      sourceKind: opts.sourceKind,
      sourceId: opts.sourceId,
      requestType: opts.sourceKind,
      summary: d.description || "스킬 후보",
      action: "create_skill",
      targetTitle: d.name,
      proposedContent: d.content,
      confidence: opts.confidence ?? 0.8,
    });
    createdCount++;
  }
  return { createdCount };
}
