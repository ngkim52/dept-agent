// 다가오는 마감 판정 — DB 의존 없는 순수 헬퍼 (클라이언트 대시보드에서 사용)
export type DueView<T = any> = { task: T; overdue: boolean; daysLeft: number };


// 날짜 문자열 정규화: YYYYMMDD → YYYY-MM-DD (기타 형식은 그대로 두되, YYYY-MM-DD 계열 반환)
export function normalizeDate(s?: string | null): string | null {
  if (s == null || s === "") return null;
  const digits = String(s).replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return String(s);
}

export function dueWithinDays<T extends { status?: string; dueDate?: string | null }>(
  tasks: T[],
  days = 7,
  now: Date = new Date()
): DueView<T>[] {
  const fc = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = fc(now);
  const cut = new Date(now); cut.setDate(cut.getDate() + days);
  const cutStr = fc(cut);
    const nd = (v: string | null | undefined) => normalizeDate(v) ?? "";
  const list = (tasks ?? [])
    .filter(t => t.status !== "done" && t.dueDate && nd(t.dueDate) <= cutStr)
    .slice()
    .sort((a, b) => (nd(a.dueDate!) < nd(b.dueDate!) ? -1 : 1));
  const parse = (s?: string | null) => { const n = normalizeDate(s); return n && n.length === 10 ? new Date(Number(n.slice(0, 4)), Number(n.slice(5, 7)) - 1, Number(n.slice(8, 10))) : now; };
  return list.map(task => {
    const d = parse(task.dueDate);
    return { task, overdue: nd(task.dueDate) < todayStr, daysLeft: Math.ceil((d.getTime() - now.getTime()) / 86400000) };
  });
}
