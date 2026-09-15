// 공용 UI 키트 — high-end-visual-design(double-bezel)·minimalist-ui(웜 모노크롬·편집형) 토큰 강제화
import type { ReactNode, ButtonHTMLAttributes } from "react";

/** Eyebrow: 섹션/카드 상단의 미세 라벨 */
export function Eyebrow({ children, tone = "accent" }: { children: ReactNode; tone?: string }) {
  return (
    <span className="eyebrow"
      style={tone === "muted" ? { color: "var(--color-ink-faint)", background: "var(--color-canvas)" } : undefined}>
      {children}
    </span>
  );
}

/** Double-Bezel 카드: 외곽 셸 + 내부 코어 (선택적 press 호버) */
export function Card({ children, className = "", press = false }: { children: ReactNode; className?: string; press?: boolean }) {
  return (
    <div className={`doppel ${press ? "press" : ""} ${className}`}>
      <div className="doppel-inner card-core bg-surface h-full">{children}</div>
    </div>
  );
}

/** 버튼-in-버튼 (화살표 칩) 기본 버튼 */
export function BtnPrimary(props: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; chip?: boolean }) {
  const { chip = true, children, ...rest } = props;
  return (
    <button type="button" className="btn-primary group-chip" {...rest}>
      {children}
      {chip && (
        <span className="arrow-chip">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
        </span>
      )}
    </button>
  );
}

/** 태그/배지 */
export function Tag({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "muted" }) {
  const cls = tone === "green" ? "bg-pale-green text-pale-green-text" : tone === "amber" ? "bg-pale-amber text-pale-amber-text" : tone === "red" ? "bg-pale-red text-pale-red-text" : "bg-canvas text-ink-faint";
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${cls}`}>{children}</span>;
}

/** 통계 수치 블록 */
export function Stat({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-3xl font-semibold tabular-nums text-ink">{value}</span>
        {unit && <span className="font-mono text-sm text-ink-faint">{unit}</span>}
      </p>
      {note && <p className="mt-1 font-mono text-[11px] text-ink-faint">{note}</p>}
    </div>
  );
}

/** 빈 상태 안내 (empty screen = 행동 유도) */
export function EmptyState({ icon, title, desc, action, onAction }: { icon?: ReactNode; title: string; desc: string; action?: string; onAction?: () => void }) {
  return (
    <div className="doppel">
      <div className="doppel-inner cards-core bg-surface flex flex-col items-center justify-center px-8 py-16 text-center">
        {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
        <p className="font-serif text-lg font-semibold text-ink">{title}</p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">{desc}</p>
        {action && onAction && (
          <span className="mt-5"><button onClick={onAction} className="font-medium text-accent hover:text-accent-deep">{action} →</button></span>
        )}
      </div>
    </div>
  );
}
