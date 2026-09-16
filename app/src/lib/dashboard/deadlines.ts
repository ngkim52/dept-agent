// 다가오는 마감 판정 — DB 의존 없는 순수 헬퍼 (클라이언트 대시보드에서 사용)
export type DueView<T = any> = { task: T; overdue: boolean; daysLeft: number };

export function dueWithinDays<T extends { status?: string; dueDate?: string | null }>(
  tasks: T[],
  days = 7,
  now: Date = new Date()
): DueView<T>[] {
  const fc = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = fc(now);
  const cut = new Date(now); cut.setDate(cut.getDate() + days);
  const cutStr = fc(cut);
  const list = (tasks ?? [])
    .filter(t => t.status !== "done" && t.dueDate && t.dueDate <= cutStr)
    .slice()
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  const parse = (s?: string | null) => s ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : now;
  return list.map(task => {
    const d = parse(task.dueDate);
    return { task, overdue: (task.dueDate ?? "") < todayStr, daysLeft: Math.ceil((d.getTime() - now.getTime()) / 86400000) };
  });
}
