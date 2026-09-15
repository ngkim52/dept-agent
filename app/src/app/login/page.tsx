"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
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
      router.replace("/");
    } catch { setError("네트워크 오류"); setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/login" className="eyebrow">Dept · Agent</Link>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-ink">
            부서장의<br />판단 파트너
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            근거를 두 축(내부 자료·판단 기준)에 맞춰 정리하고,<br />
            업무 범위에 따라 결론까지 또는 제안까지 함께 냅니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["지급보험금", "시스템", "고객편의", "품질", "신상품", "사업계획"].map((t, i) => (
              <span key={t} className="rounded-full border border-line bg-canvas px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                카드 {String(i + 1).padStart(2, "0")} · {t}
              </span>
            ))}
          </div>
        </div>
        <form onSubmit={onSubmit} className="rise doppel">
          <div className="doppel-inner card-core bg-surface space-y-4 p-8">
          <div>
            <label htmlFor="email" className="text-xs font-medium text-ink-soft">회사 이메일</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="name@shinhan.com"
              className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-medium text-ink-soft">비밀번호</label>
            <input id="password" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
          </div>
          {error && <p role="alert" className="rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{error}</p>}
          <button type="submit" disabled={busy}
            className="lift w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33312E] disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "로그인 중…" : "로그인"}
          </button>
          <p className="text-center text-sm text-ink-soft">
            계정이 없으신가요?{" "}
            <Link href="/register" className="font-medium text-accent hover:text-accent-deep">가입 신청</Link>
          </p>
          </div>
        </form>
      </div>
    </main>
  );
}
