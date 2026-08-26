// 간단한 인메모리 IP 기반 레이트리밋 (MVP용, 단일 인스턴스 기준)
import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const DEFAULT_MAX = 10;

const hits = new Map<string, { count: number; resetAt: number }>();

// 프레임/로드밸런서가 설정하는 신뢰 채널의 IP만 사용한다.
// - X-Real-IP(신뢰 프록시가 주입)를 최우선으로.
// - 없으면 X-Forwarded-For의 가장 오른쪽(프록시가 덧붙이는 최신 홉)을 사용.
//   클라이언트가 첫 칸을 위조해도 신뢰 프록시가 실제 IP를 뒤쪽에 추가하므로 첫 값을 쓰지 않는다.
function trustedClientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "unknown";
}

export function clientIp(req: NextRequest): string {
  return trustedClientIp(req);
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
