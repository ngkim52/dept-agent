// 업무진도 모니터링: 일감별 부서장 의견 + 종료 일감 보고 시간 추천 (018-C)
// 부서장 일정을 참고해 LLM이 일감별 의견을 만들고, 완료(done) 일감엔 보고 시간을 추천한다.

export type MonitorOpinion = { title: string; opinion: string; reportTime?: string; status?: string };

export type OpinionTask = {
  title: string; status: string; assignee?: string | null; dueDate?: string | null;
  category?: string | null; progress?: number; dueLeft?: number; content?: string | null;
};
export type ScheduleRow = { date: string; time?: string | null; title: string; note?: string | null };

export const MONITOR_OPINION_SOURCE = "monitor-llm";

export function buildMonitorOpinionPrompt(tasks: OpinionTask[], schedule: ScheduleRow[]): string {
  const lines = tasks.map((t, i) => {
    const due = t.dueDate ? (t.dueLeft != null ? `${t.dueDate} (D${t.dueLeft >= 0 ? "+" + t.dueLeft : t.dueLeft})` : t.dueDate) : "미정";
    return `${i + 1}. 제목: ${t.title} | 상태: ${t.status} | 담당: ${t.assignee ?? "미지정"} | 기한: ${due} | 진행률: ${t.progress ?? 0}% | 내용: ${t.content ?? "(없음)"}`;
  }).join("\n");
  const sched = schedule.length
    ? schedule.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
        .map(s => `${s.date}${s.time ? " " + s.time : ""} - ${s.title}${s.note ? " (" + s.note + ")" : ""}`).join("\n")
    : "(등록된 부서장 일정 없음)";
  return [
    "당신은 보험금 심사 부서의 부서장입니다. 아래 업무진도 모니터링의 일감 각각에 대해 간결한 부서장 의견(지시/조언, 1~2문장)을 한국어로 작성하세요.",
    "종료(status=done)된 일감에는 부서장 일정을 참고해 '보고 시간'(보고하는 것이 좋은 시각)도 추천하세요. 가능하면 일정과 겹치지 않는 시간(HH:MM)을 제안하세요.",
    "",
    "부서장 일정:",
    sched,
    "",
    "일감 목록:",
    lines,
    "",
    "아래 JSON 배열 형식으로만 응답하세요(추가 설명 금지).",
    '[{"title":"<일감 제목과 정확히 일치>","opinion":"<부서장 의견>","reportTime":"<종료 일감만: HH:MM 또는 보고해야 할 시점>"}]',
  ].join("\n");
}

export function parseMonitorOpinions(raw: string, tasks: OpinionTask[]): MonitorOpinion[] {
  let text = raw.trim();
  const cb = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (cb) text = cb[1].trim();
  let arr: any[] = [];
  try { arr = JSON.parse(text); } catch {
    const sIdx = text.indexOf("["), eIdx = text.lastIndexOf("]");
    if (sIdx >= 0 && eIdx > sIdx) { try { arr = JSON.parse(text.slice(sIdx, eIdx + 1)); } catch { arr = []; } }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(x => x && typeof x === "object" && x.title)
    .map(x => {
      const t = tasks.find(tt => tt.title === String(x.title));
      return {
        title: String(x.title),
        opinion: String(x.opinion ?? "").trim(),
        reportTime: x.reportTime ? String(x.reportTime) : undefined,
        status: t?.status,
      } as MonitorOpinion;
    })
    .filter(o => o.opinion);
}

import { listWorkTasks } from "@/lib/harness/workQueue";
import { listDirectorSchedule } from "@/lib/harness/directorSchedule";
import { getLlmModel } from "@/lib/agent/llm";

export type GenerateMonitorOptions = { call?: (prompt: string) => Promise<string> };

export function dueGap(date?: string | null): number | undefined {
  if (!date) return undefined;
  const now = new Date();
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

export async function generateMonitorOpinions(opts: GenerateMonitorOptions = {}): Promise<MonitorOpinion[]> {
  const tasks = await listWorkTasks();
  const schedule = await listDirectorSchedule();
  if (tasks.length === 0) return [];
  const taskViews: OpinionTask[] = tasks.map(t => ({
    title: t.title, status: t.status, assignee: t.assignee, dueDate: t.dueDate,
    category: t.category, progress: t.progress, dueLeft: dueGap(t.dueDate), content: t.content,
  }));
  const prompt = buildMonitorOpinionPrompt(taskViews, schedule.map(s => ({ date: s.date, time: s.time, title: s.title, note: s.note })));
  let raw: string;
  if (opts.call) {
    raw = (await opts.call(prompt)).trim();
  } else {
    const { models, model } = await getLlmModel("simple");
    const res = await models.completeSimple(model, {
      messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
    });
    raw = (res?.content ?? [])
      .filter((t: any) => t?.type === "text")
      .map((t: any) => t.text)
      .join("")
      .trim();
  }
  return parseMonitorOpinions(raw, taskViews);
}
