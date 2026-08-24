// 간단한 인메모리 IP 기반 레이트리밋 (MVP용, 단일 인스턴스 기준)
import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const DEFAULT_MAX = 10;

const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

// 엔드포인트 키("login"/"register") + IP 기준 1분 윈도우 제한
export function checkRateLimit(req: NextRequest, key: string, max = DEFAULT_MAX): RateLimitResult {
  const now = Date.now();
  const id = `${key}:${clientIp(req)}`;
  const cur = hits.get(id);
  if (!cur || cur.resetAt <= now) {
    hits.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSeconds: 0 };
  }
  cur.count += 1;
  if (cur.count > max) {
    return { ok: false, retryAfterSeconds: Math.ceil((cur.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

// 테스트 등에서 인메모리 상태 초기화용
export function resetRateLimits(): void {
  hits.clear();
}

export function rateLimitExceededResponse(retryAfterSeconds: number): Response {
  const res = Response.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}
