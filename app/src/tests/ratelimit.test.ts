import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { clientIp } from "@/lib/auth/ratelimit";

describe("clientIp — 신뢰 IP 결정 보안", () => {
  it("X-Real-IP가 있으면 X-Forwarded-For 위조 첫 값 대신 그 값을 사용", () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6, 7.7.7.7" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("X-Real-IP 없으면 XFF의 마지막(프록시가 추가한) 값을 사용 — 첫 위조값은 무시", () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("헤더가 없으면 unknown", () => {
    const req = new NextRequest("http://localhost/api/auth/login", {});
    expect(clientIp(req)).toBe("unknown");
  });
});
