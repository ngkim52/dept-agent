// 토론방 입력 검증 (019)
export const ALLOWED_DURATIONS = [60, 180, 300, 600, 900] as const;
export const DEFAULT_DURATION_SEC = 180;
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 8;

/** 토론 시간 — 허용값이 아니면 기본 3분으로 클램프 */
export function clampDuration(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_DURATION_SEC;
  const rounded = Math.round(n);
  if ((ALLOWED_DURATIONS as readonly number[]).includes(rounded)) return rounded;
  if (rounded <= 60) return 60;
  if (rounded >= 900) return 900;
  return DEFAULT_DURATION_SEC;
}

/** 참가자 key 정규화 — 존재하는 key 만, 결론 에이전트 제외, 중복 제거, 최대 8명 */
export function normalizeParticipantKeys(keys: unknown, valid: Set<string>): string[] {
  if (!Array.isArray(keys)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const key = String(k ?? "").trim();
    if (!key || !valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_PARTICIPANTS) break;
  }
  return out;
}
