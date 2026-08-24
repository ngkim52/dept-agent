"use client";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "로그인 실패"); setBusy(false); return; }
      window.location.href = "/chat";
    } catch { setError("네트워크 오류"); setBusy(false); }
  }

  return (
    <main className="flex min-h-screen">
      {/* 왼쪽 — 브랜드 패널 (주제의 세계) */}
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-canvas p-12 lg:flex">
        {/* 앰비언트 라이트(매우 은은하게) */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(31,108,159,0.07), transparent 70%)" }} />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Dept · Agent</p>
          <h1 className="mt-6 font-serif text-5xl font-semibold leading-tight tracking-tight text-ink">
            부서장
          </h1>
          <p className="mt-2 text-lg font-medium text-ink-soft">페르소나 에이전트</p>
          <p className="mt-8 max-w-sm text-sm leading-relaxed text-ink-soft">
            작성한 자료부터 업무 계획까지. 부서 담당 부서장이
            업무적 판단으로 검증하고, 조언하고, 다음 아이디어를 제안합니다.
          </p>
        </div>
        {/* 답변은 실제 순서(검증→조언→아이디어)이므로 번호가 정보를 담음 */}
        <div className="relative max-w-sm">
          <div className="divide-y divide-line border-y border-line">
            {[
              ["01", "검증", "절차·기준에 부합하는지 짚어드립니다"],
              ["02", "조언", "리스크와 개선 방안을 구체적으로 제시합니다"],
              ["03", "아이디어", "효율화·디지털 전환 방향을 제안합니다"],
            ].map(([n, t, d]) => (
              <div key={n} className="flex items-baseline gap-4 py-4">
                <span className="font-mono text-xs text-ink-faint">{n}</span>
                <span className="w-16 text-sm font-semibold text-ink">{t}</span>
                <span className="flex-1 text-xs leading-relaxed text-ink-soft">{d}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            Internal · 보험금심사기획 · 계리
          </p>
        </div>
      </section>

      {/* 오른쪽 — 로그인 폼 */}
      <section className="flex flex-1 items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Dept · Agent</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-ink">부서장 페르소나 에이전트</h1>
          </div>
          <div className="rounded-xl border border-line bg-surface p-8">
            <h2 className="text-lg font-semibold tracking-tight text-ink">로그인</h2>
            <p className="mt-1 text-sm text-ink-soft">회사 이메일로 접속합니다.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="text-xs font-medium text-ink-soft">회사 이메일</label>
                <input id="email" type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@shinhan.com"
                  className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
              </div>
              <div>
                <label htmlFor="password" className="text-xs font-medium text-ink-soft">비밀번호</label>
                <input id="password" type="password" required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
              </div>
              {error && <p role="alert" className="rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{error}</p>}
              <button type="submit" disabled={busy}
                className="lift w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33312E] disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? "로그인 중…" : "로그인"}
              </button>
            </form>
            <p className="mt-5 text-center text-sm text-ink-soft">
              계정이 없으신가요?{" "}
              <Link href="/register" className="font-medium text-accent hover:text-accent-deep">가입 신청</Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
