// 관전 화면 메시지 병합 — 초기 로드와 폴링이 겹쳐도 중복이 생기지 않게 한다 (019)
export type MergeResult<T extends { id: string; seq: number }> = {
  messages: T[];
  lastSeq: number;
  added: number;
};

/**
 * 기존 목록 + 새로 받은 메시지 → 중복 없이 병합.
 * - 이미 가진 id 는 버린다(초기 로드와 첫 폴링이 겹칠 때 발생하는 중복 방지)
 * - lastSeq 이하의 과거 메시지는 버린다(같은 구간을 두 번 받아도 안전)
 * - 반환된 lastSeq 는 "지금까지 받은 최대 seq"
 */
export function mergeIncoming<T extends { id: string; seq: number }>(
  existing: T[],
  incoming: T[],
  lastSeq: number,
): MergeResult<T> {
  const seen = new Set(existing.map((m) => m.id));
  const fresh: T[] = [];
  for (const m of incoming) {
    if (!m || typeof m.seq !== "number") continue;
    if (m.seq <= lastSeq) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    fresh.push(m);
  }
  if (fresh.length === 0) return { messages: existing, lastSeq, added: 0 };
  const next = [...existing, ...fresh].sort((a, b) => a.seq - b.seq);
  return { messages: next, lastSeq: Math.max(lastSeq, ...fresh.map((m) => m.seq)), added: fresh.length };
}

/** 서버가 준 전체 목록으로 상태를 새로 세팅할 때의 커서 */
export function maxSeqOf<T extends { seq: number }>(messages: T[]): number {
  return messages.reduce((n, m) => (typeof m.seq === "number" && m.seq > n ? m.seq : n), 0);
}
