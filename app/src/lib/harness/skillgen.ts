// 스킬 자동 생성(skill-maker) — 사용자가 원하는 스킬의 목적을 물어보고,
// 참조 가능한 데이터(기존 스킬·메모리·과거 대화·문서)를 수집하고,
// 부족하면 웹검색으로 보강한 뒤 LLM으로 새 스킬 초안을 생성한다.
// 생성 결과는 초안(draft)이며 사용자 확인·저장 후에만 knowledge_skills에 반영된다.
import { getLlmModel } from "@/lib/agent/llm";
import { getPersonaSkills } from "@/lib/agent/skills";
import { listMemories, createSkill } from "./store";
import { webSearch } from "@/lib/agent/websearch";
import { db, schema } from "@/lib/db";
import { desc, asc, eq } from "drizzle-orm";

export interface SkillGenContextSource {
  type: "conversation" | "memory" | "existing_skill" | "document";
  label: string;
  text: string;
}

export interface SkillGenContext {
  topic: string;
  personaKey: string;
  sources: SkillGenContextSource[];
  web: { used: boolean; query?: string; results: string[] };
}

export interface SkillDraft {
  name: string;
  description: string;
  content: string;
  relatedSkills: { name: string; description: string; matched: boolean }[];
  webUsed: boolean;
}

const MAX_CONVERSATIONS = 6;
const MAX_CONV_MSGS = 14;

/** 최근 부서 대화 수집 (대화 제목 + 사용자/어시스턴트 메시지) */
async function collectConversations(personaKey: string, topic: string): Promise<SkillGenContextSource[]> {
  const convs = await db.select().from(schema.conversations)
    .where(eq(schema.conversations.departmentId, personaKey))
    .orderBy(desc(schema.conversations.createdAt)).limit(MAX_CONVERSATIONS);
  convs.reverse();
  const out: SkillGenContextSource[] = [];
  for (const c of convs) {
    const msgs = await db.select({ role: schema.messages.role, content: schema.messages.content })
      .from(schema.messages).where(eq(schema.messages.conversationId, c.id))
      .orderBy(asc(schema.messages.createdAt)).limit(MAX_CONV_MSGS);
    if (!msgs.length) continue;
    const qa = msgs.filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `[${m.role}] ${String(m.content).slice(0, 600)}`).join("\n");
    out.push({ type: "conversation", label: c.title || "대화", text: qa });
  }
  return out;
}

/** 메모리 수집 — 주제와 관련된 메모리(전부, 하네스에 저장된 지식) */
async function collectMemories(personaKey: string, topic: string): Promise<SkillGenContextSource[]> {
  const mems = await listMemories(personaKey);
  const kw = topic.split(/\s+/).filter((w) => w.length >= 2);
  const scored = mems.map((m) => {
    const cw = new Set((m.content + " " + (m.tags ?? "")).split(/\s+/));
    const hit = kw.filter((w) => [...cw].some((x) => x.includes(w) || w.includes(x))).length;
    return { m, hit };
  }).sort((a, b) => b.hit - a.hit);
  const pick = scored.filter((x) => x.hit > 0).length >= 3 ? scored : scored;
  return pick.slice(0, 12).map((x) => ({
    type: "memory" as const,
    label: `[${x.m.kind}] ${x.m.personaKey}`,
    text: x.m.content,
  }));
}

/** 문서 수집 — 부서 연계 문서 본문 (텍스트 계열) */
async function collectDocuments(personaKey: string): Promise<SkillGenContextSource[]> {
  const rows = await db.select().from(schema.documents)
    .where(eq(schema.documents.departmentId, personaKey)).limit(6);
  return rows.filter((d) => d.content).slice(0, 6).map((d) => ({
    type: "document" as const,
    label: d.filename,
    text: String(d.content).slice(0, 1200),
  }));
}

/** 관련 기존 스킬 찾기 — 주제와 이름/설명 토큰 겹침 기반 */
export function findRelatedSkills(personaKey: string, topic: string, draftName = ""): { name: string; description: string; matched: boolean }[] {
  const skills = getPersonaSkills(personaKey).filter((s) => !s.name.includes("스킬 생성기"));
  const kw = new Set((topic + " " + draftName).split(/\s+/).filter((w) => w.length >= 2));
  return skills.map((s) => {
    const words = new Set((s.name + " " + s.description).split(/\s+/));
    const matched = [...kw].some((w) => [...words].some((x) => x.includes(w) || w.includes(x)));
    return { name: s.name, description: s.description, matched };
  });
}

/** 내부 데이터가 주제 파악에 충분한지 — 기존 스킬·메모리·대화가 있으면 충분으로 간주, 없으면 웹검색 보강 */
function needsWebSearch(sources: SkillGenContextSource[]): boolean {
  const meaningful = sources.filter((s) => s.text.trim().length >= 40);
  return meaningful.length === 0;
}

const BUILDER_SYSTEM = `당신은 스킬 설계자(스킬 생성기)입니다. 부서 페르소나에 주입되는 스킬(SKILL.md: 행동원칙·사고방식·업무절차)을 설계·작성합니다.
참조 데이터(기존 스킬·메모리·과거 대화·문서·웹검색)를 바탕으로, 다음 JSON만 출력하세요(설명 없이):
{
  "name": "<스킬 이름>",
  "description": "<언제 사용하는지 + 라우팅 조건 + 범위 배제 문구, 1~3문장>",
  "content": "<SKILL.md 본문>"
}
content는 아래 구조를 따릅니다:
# 요구 시점
- <이 스킬이 필요한 구체적 상황>
## 판단 기준
- <정량·정성 판단 기준과 원칙>
## 데이터 사용
- <내부 RAG/집계 + 외부 웹검색 구분>
## 출력
[요약] → [현황] → [판단·원인] → [권고] → [다음 단계] → [추가 확인]
- description에 다른 스킬과 겹치지 않도록 범위 배제 문구를 넣으세요.
- 한 스킬에 업무를 몰아넣지 말고 목적이 명확한 단위로 작성하세요.
- content는 마크다운 본문(요구시점/판단기준/데이터사용/출력 섹션)만 포함합니다.`;

/** 참조 데이터 → LLM 프롬프트 조립 */
export function buildSkillBuilderPrompt(topic: string, personaKey: string, srcs: SkillGenContextSource[], web: string[]): string {
  const personaLabel = personaKey === "actuarial" ? "계리" : "보험금심사기획";
  const lines = [`대상 부서(페르소나): ${personaLabel} (${personaKey})`, `사용자가 만들고 싶은 스킬: ${topic}`, ""];
  if (srcs.length) {
    lines.push("── 참조 데이터 ──");
    for (const s of srcs) lines.push(`[${s.label}]\n${s.text}`);
  } else {
    lines.push("(내부 참조 데이터 없음)");
  }
  if (web.length) {
    lines.push("", "── 웹검색 보강 자료 ──");
    web.forEach((w, i) => lines.push(`[웹 ${i + 1}] ${w}`));
  }
  lines.push("", "위 데이터를 종합해 스킬을 설계하고 JSON을 출력하세요.");
  return lines.join("\n");
}

/** LLM 호출 — response 모델로 스킬 초안 생성 */
async function callSkillBuilder(prompt: string): Promise<string> {
  const { models, model } = await getLlmModel("response");
  const res = await models.completeSimple(model, {
    messages: [{ role: "user" as const, content: BUILDER_SYSTEM + "\n\n" + prompt, timestamp: Date.now() }],
  });
  const text = (res?.content ?? [])
    .filter((t: any) => t?.type === "text")
    .map((t: any) => t.text)
    .join("");
  if (!text) throw new Error("스킬 생성 모델 응답이 비어 있습니다.");
  return text;
}

/** LLM 응답에서 JSON 객체 추출 */
export function parseSkillDraft(raw: string): { name: string; description: string; content: string } {
  let s = raw.trim();
  const fence = s.match(/````(?:json)?\s*([\s\S]*?)````/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  const obj = JSON.parse(s);
  const name = String(obj.name ?? "").trim();
  const description = String(obj.description ?? "").trim();
  const content = String(obj.content ?? "").trim();
  if (!name || !content) throw new Error("스킬 초안에 이름/본문이 없습니다.");
  return { name, description, content };
}

/** 메인 진입 — 컨텍스트 수집 + (필요 시) 웹검색 보강 + LLM 생성 */
export async function generateSkillDraft(topic: string, personaKey: string, opts: { useWeb?: boolean } = {}): Promise<SkillDraft> {
  const t = topic.trim();
  if (!t) throw new Error("만들고 싶은 스킬의 목적을 입력해 주세요.");
  const [conv, mem] = await Promise.all([
    collectConversations(personaKey, t),
    collectMemories(personaKey, t),
  ]);
  const docs = await collectDocuments(personaKey);
  let sources: SkillGenContextSource[] = [...existingSkillSources(personaKey), ...mem, ...docs, ...conv];
  // 중복 (라벨 기반) 얕은 정리
  sources = sources.filter((s, i) => sources.findIndex((x) => x.label === s.label && s.type === "conversation") === i);

  // 웹검색 보강 (내부 데이터 부족하거나 명시 요청 시)
  let web: { used: boolean; query?: string; results: string[] } = { used: false, results: [] };
  if (opts.useWeb || needsWebSearch(sources)) {
    const q = `${t} 업무 기준 판단 프로세스`;
    const res = await webSearch(q).catch(() => ({ ok: false, results: [], provider: "none" as const }));
    if (res.ok && res.results.length) {
      web = { used: true, query: q, results: res.results.map((r) => `${r.title} — ${r.snippet}`) };
    }
  }

  const prompt = buildSkillBuilderPrompt(t, personaKey, sources, web.results);
  const raw = await callSkillBuilder(prompt);
  const draft = parseSkillDraft(raw);
  const related = findRelatedSkills(personaKey, t, draft.name);
  return { ...draft, relatedSkills: related, webUsed: web.used };
}

function existingSkillSources(personaKey: string): SkillGenContextSource[] {
  return getPersonaSkills(personaKey)
    .filter((s) => !s.name.includes("스킬 생성기"))
    .map((s) => ({ type: "existing_skill" as const, label: `기존 스킬: ${s.name}`, text: `${s.description}\n${s.content.slice(0, 1200)}` }));
}

/** 사용자 확인 후 저장 */
export async function saveGeneratedSkill(draft: { name: string; description: string; content: string }, personaKey: string, userId: string) {
  return createSkill({
    personaKey,
    name: draft.name,
    description: draft.description,
    content: draft.content,
    origin: "manual",
    confidence: 0.9,
  }, userId);
}
