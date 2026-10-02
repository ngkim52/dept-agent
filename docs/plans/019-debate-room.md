# Debate Room (토론방) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans 로 Task 단위 실행. 각 Step 은 `- [ ]` 체크박스로 추적한다.

**Goal:** 복잡한 기획·의사결정 안건을 서로 다른 페르소나 에이전트들이 메신저 형태로 실시간 토론하게 하고, 사람은 관전만 하다가 종료 시 "최종 요약 보고서(MD)"를 받는 신규 메뉴를 추가한다.

**Architecture:** 토론 세션/발언을 SQLite(`debate_sessions`, `debate_messages`, `debate_personas`)에 저장하는 **DB 기반 상태머신**으로 만든다. 토론 실행은 서버가 백그라운드에서 턴 루프를 돌리며 발언을 DB에 append 하고, 관전 화면은 `?since=<seq>` 폴링으로 새 발언만 받아 실시간 메신저처럼 렌더링한다(페이지 새로고침·재접속에 강함, 추후 SSE 로 교체 가능). 종료 조건(설정 시간 경과 또는 사용자 중단)을 만족하면 '최종 결론 에이전트'가 전체 로그를 읽어 보고서 MD 를 생성하고 `DATA_DIR/debates/<sessionId>/report.md` 로 저장한다. 화면은 `MarkdownViewer` 로 그 MD 를 보여주고 다운로드도 제공한다.

**Tech Stack:** Next.js 16 App Router(Route Handlers, `after()`), React 19 client components, Drizzle ORM + better-sqlite3, TypeScript, vitest, Tailwind(기존 토큰/컴포넌트 재사용), `@earendil-works/pi-ai`(기존 `getLlmModel` 경유).

**Spec:** `docs/plans/019-debate-room.md` (본 문서). 상위 요구: `docs/000-요구사항.md`, 기존 기능 문서 `docs/features/f009-토론방.md`(Task T20 에서 작성).

## Global Constraints

- 모든 DB 접근은 `@/lib/db` 의 `db`/`schema` 를 통한다. 새 테이블은 ① `src/lib/db/schema.ts`, ② `drizzle/0010_*.sql` + `drizzle/meta/_journal.json`, ③ `src/lib/db/index.ts` 의 `CREATE TABLE IF NOT EXISTS` 안전망 3곳을 모두 반영한다(기존 `qa_consolidations`/`work_tasks` 패턴).
- LLM 호출은 반드시 `getLlmModel(purpose)` 를 경유한다. 토론 발언은 `"simple"`, 최종 보고서는 `"simple"` 을 기본으로 한다. **`"response"` 모델(`openai/gpt-6-astra`)은 추론 필수라 `completeSimple` 에서 400 이 날 수 있으므로 쓰지 않는다.**
- LLM JSON 파싱은 `@/lib/util/jsonLoose` 의 `parseJsonLoose` 를 쓴다(`JSON.parse` 직접 사용 금지).
- 사용자 인증은 `requireUser(req)`(`@/lib/auth/http`), 오류 응답은 `jsonError(e)` / `HttpError` 를 쓴다.
- 파일 저장 경로는 `process.env.DATA_DIR ?? path.join(process.cwd(), "data")` 기준. 토론 보고서는 `debates/<sessionId>/report.md`.
- 모든 신규 라이브러리 파일은 `src/lib/debate/` 아래에 둔다. 라우트는 `src/app/api/debate/...`, 화면은 `src/app/(app)/debate/...`.
- 테스트 파일은 `src/tests/debate-*.test.ts`. DB 를 쓰는 테스트는 `resetDb()` + `withDept()` 를 `beforeEach` 에서 호출하고, `resetDb()` 에 새 테이블 삭제를 추가한다.
- 검증 게이트(각 Phase 종료 시): `cd app && npx tsc --noEmit` exit 0, `npx vitest run` 전체 통과.
- 커밋은 사용자 확인 후 진행한다(현재 워크스페이스에 미커밋 변경이 있음).

## 확정 기본값 (미확정 항목은 이 값으로 진행)

| 항목 | 값 | 근거 |
|---|---|---|
| 기본 토론 시간 | 180초(3분), 선택 60/180/300/600/900초 | "일정시간이 지나면 종료" 요구 |
| 최대 발언 수 안전 상한 | 80 발언 | 무한 루프/비용 폭주 방지 |
| 발언 순서 | 라운드 로빈(선택 순서 고정) | 사회자 LLM 호출 없이 결정적·저비용 |
| 옵저버 | 옵저버 kind 페르소나(금감원)는 매 라운드 1회 발언 | 규제 관점을 주기적으로 환기 |
| 최종 결론 에이전트 | 토론 중 발언하지 않고 종료 시 1회 보고서 작성 | "최종결론 에이전트는 내용을 정리" 요구 |
| 실시간 전달 | 1.2초 폴링(`?since=`) | 새로고침·재접속 강함, SSE 는 후속 |
| 동시 진행 | 사용자당 진행 중 토론 1개 | 서버 부하 보호 |
| 보고서 파일 | `DATA_DIR/debates/<sessionId>/report.md` | 요구 2 |
| 커스텀 페르소나 | 생성 가능(기본 10종 + 사용자 추가) | 요구 1 "여러개를 만들고 선택" |
| 최소 참가자 | 2명(결론 에이전트 제외) | 토론 성립 조건 |

---

## 진행 상태 (체크포인트)

- [x] **Phase 1 — 기반** T01 DB 3종 · T02 기본 페르소나 10종 · T03 저장소 · T04 보고서 MD
- [x] **Phase 1.5 — 페르소나별 모델** T05
- [x] **Phase 2 — 엔진** T06·T07
- [x] **Phase 3 — API** T08~T11
- [x] **Phase 4 — 관전 UI** T12~T15
- [x] **Phase 5 — 검증/문서** T16
- [x] **Phase 6 — v2(페르소나 편집·파일 업로드·현실감/보고서)** T17~T19
- [x] **Phase 7 — v3(말투 다양화 + 감정·속마음)** T20

검증(전체): `npx tsc --noEmit` exit 0 · `npx vitest run` 58 files / 369 tests passed

---

## Phase 7 — v3: 말투 다양화 + 참가자 감정·속마음 (완료)

### Task T20: 말투 다양화 · 감정/만족도/입장/속마음 수집·표시

**Files:** `app/src/lib/debate/style.ts`(신규), `personas.ts`, `engine.ts`, `store.ts`, `types.ts`, `report.ts`, `app/src/app/(app)/debate/[id]/EmotionPanel.tsx`(신규), `DebateStage.tsx`, `DebateRoom.tsx`, `app/src/lib/db/schema.ts`, `app/drizzle/0012_debate_message_state.sql`

**요구:** ① "수용할 수 있습니까?" 식 단조로운 말투 → 다양·자연스럽게 ② 페르소나 만족도/감정/속마음을 **대화창 밖 별도 섹션**에서 계속 표시

- **말투 다양화**: `style.ts` 의 `CLOSING_STYLES` 6종(질문/단정/조건 제시/사실 지적/대안 제안/감정 토로)을 발언 순번으로 순환 배정하고, `RHYTHM_HINTS` 로 문장 리듬도 교체. `DEBATE_COMMON_RULES` 에 "상투적 질문으로 매번 끝내지 말 것" + "구어체" + "문장 길이 들쭉날쭉" 규칙을 추가하고, 직전 3개 발언의 끝맺음을 프롬프트에 넣어 반복을 막는다.
- **상태 수집(추가 호출 없음)**: 턴 출력을 JSON 한 덩어리로 받는다 → `{ speech, emotion, satisfaction, stance, innerThought }`. `parseTurnOutput` 이 관용 파싱 + 화이트리스트 정규화 + 0~100 클램프, JSON 이 아니면 `speech=전체 텍스트` 폴백(상태는 빈 값).
- **저장**: `debate_messages` 에 `emotion/satisfaction/stance/inner_thought` 컬럼(마이그레이션 0012 + 안전망 ALTER).
- **표시(별도 섹션)**: `EmotionPanel` — 참가자별 감정 배지 · 만족도 게이지+숫자+스파크라인 · 입장 배지 · 속마음(최신 + 이전 기록). 대화창(`DebateStage`)에는 상태를 그리지 않는다. 라이브 탭은 `lg:grid-cols-[minmax(0,1fr)_340px]` 2단.
- **보고서**: `부록 A. 참가자 감정·속마음` 표(최종 입장 / 만족도 변화 / 감정 흐름 / 마지막 속마음), `buildEmotionFlow` 로 결정적 생성.
- **발언 로그 제거**(사용자 피드백): 보고서에서 `부록 발언 로그` 를 삭제 — 전체 대화는 관전 탭에서 확인 가능. `REPORT_SECTIONS` 에서도 제거하고, 이미 생성된 보고서 파일에서도 해당 섹션을 잘라냈다.
- **테스트**: `parseTurnOutput` 3건, 말투 다양화 1건, 상태 저장 2건, `debate-emotion-panel` 2건, 부록 B 1건.
- **라이브(4인·150초)**: 끝맺음이 `~답해 보시기 바랍니다 / 조건이 빠지면 저는 반대합니다 / ~수용하겠습니다 / 이 기회를 놓칠까 봐 답답하네요 / ~산출해본 적이 있는가?` 등으로 실제 다양해졌고, 15발언 중 14건에서 상태가 수집됐다(1건은 모델이 JSON 을 안 내 폴백 → 발언만 저장, 설계대로 동작).

---

## File Structure (무엇을 만들고/고치는가)

**신규**
- `app/src/lib/debate/types.ts` — 공용 타입(`DebateStatus`, `DebateSession`, `DebateMessage`, `DebateParticipant`, `DebateReport`).
- `app/src/lib/debate/personas.ts` — 기본 페르소나 10종 카탈로그 + 조회/검증 헬퍼.
- `app/src/lib/debate/store.ts` — 세션·발언·커스텀페르소나 CRUD(DB 경계).
- `app/src/lib/debate/storage.ts` — 보고서 MD 파일 저장/읽기(DATA_DIR).
- `app/src/lib/debate/report.ts` — 최종 보고서 MD 조립(합성 JSON → 결정적 템플릿).
- `app/src/lib/debate/engine.ts` — 발언 프롬프트, 발언자 선택, 턴 루프, 종료/중단, 결론 생성.
- `app/src/app/api/debate/route.ts` — `POST` 생성, `GET` 목록.
- `app/src/app/api/debate/[id]/route.ts` — `GET` 상세(세션+발언+보고서 존재 여부).
- `app/src/app/api/debate/[id]/stream/route.ts` — `GET` 증분 폴링(`?since=`).
- `app/src/app/api/debate/[id]/start/route.ts` — `POST` 시작(백그라운드 실행).
- `app/src/app/api/debate/[id]/stop/route.ts` — `POST` 중단 → 즉시 결론.
- `app/src/app/api/debate/[id]/report/route.ts` — `GET` MD 열람(JSON) / `?download=1` 첨부.
- `app/src/app/api/debate/personas/route.ts` — `GET` 목록, `POST` 커스텀 생성.
- `app/src/app/(app)/debate/page.tsx` — 토론방 허브(생성 폼 + 진행/지난 토론 목록 + 페르소나 관리).
- `app/src/app/(app)/debate/[id]/page.tsx` — 관전 화면(라이브 타임라인 + 리포트 탭).
- `app/src/app/(app)/debate/DebateStage.tsx` — 관전 타임라인/참가자 레일/타이머 컴포넌트.
- `app/src/app/(app)/debate/PersonaPicker.tsx` — 페르소나 선택/추가 UI.
- `app/src/tests/debate-personas.test.ts`, `debate-store.test.ts`, `debate-report.test.ts`, `debate-engine.test.ts`, `debate-api.test.ts`.
- `docs/features/f009-토론방.md` — 기능 문서.

**수정**
- `app/src/lib/db/schema.ts` — 3개 테이블 추가.
- `app/src/lib/db/index.ts` — 테이블 안전망 추가.
- `drizzle/0010_debate_room.sql` + `drizzle/meta/_journal.json` — 마이그레이션.
- `app/src/tests/helpers.ts` — `resetDb()` 에 debate 테이블 삭제 추가.
- `app/src/lib/nav.ts` — 메뉴/아이콘 추가.
- `app/src/app/(app)/layout.tsx` — `/debate/[id]` 는 몰입형(선택, Task T15).

---

## Phase 1 — 기반: 데이터 · 페르소나 · 저장소

### Task T01: DB 테이블 3종 (세션·발언·커스텀 페르소나)

**Files:**
- Modify: `app/src/lib/db/schema.ts` (파일 끝, `directorSchedule` 뒤)
- Create: `app/drizzle/0010_debate_room.sql`
- Modify: `app/drizzle/meta/_journal.json` (마지막 엔트리 뒤 idx:10 추가)
- Modify: `app/src/lib/db/index.ts` (기존 `work_tasks` 안전망 블록 뒤)
- Test: `app/src/tests/debate-store.test.ts` (Task T04/T06 에서 확장)

**Interfaces:**
- Produces: `schema.debateSessions`, `schema.debateMessages`, `schema.debatePersonas` 및 타입 `DebateSessionRow|NewDebateSessionRow|DebateMessageRow|NewDebateMessageRow|DebatePersonaRow|NewDebatePersonaRow`.

- [ ] **Step 1: schema.ts 에 테이블 3종 추가**

```ts
// ── Debate Room: 페르소나 난상토론 (019) ──
export const debateSessions = sqliteTable("debate_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),                       // 안건 제목
  brief: text("brief").notNull().default(""),           // 기획안/배경 원문
  status: text("status", { enum: ["draft", "running", "finished", "stopped", "failed"] })
    .notNull().default("draft"),
  durationSec: integer("duration_sec").notNull().default(180),
  participantKeys: text("participant_keys").notNull().default("[]"), // JSON 문자열 배열
  round: integer("round").notNull().default(0),
  turnCount: integer("turn_count").notNull().default(0),
  maxTurns: integer("max_turns").notNull().default(80),
  verdict: text("verdict"),                             // 최종 판정 한 줄
  reportPath: text("report_path"),                      // MD 파일 경로
  createdBy: text("created_by"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({ dsStatusIdx: index("debate_sessions_status_idx").on(t.status) }));

export const debateMessages = sqliteTable("debate_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => debateSessions.id),
  seq: integer("seq").notNull(),                        // 1부터 증가, 폴링 커서
  personaKey: text("persona_key").notNull(),
  personaName: text("persona_name").notNull(),
  personaEmoji: text("persona_emoji").notNull().default(""),
  personaColor: text("persona_color").notNull().default("#1F6C9F"),
  kind: text("kind", { enum: ["member", "observer", "conclusion", "system"] }).notNull().default("member"),
  round: integer("round").notNull().default(1),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  dmSessionIdx: index("debate_messages_session_idx").on(t.sessionId, t.seq),
}));

export const debatePersonas = sqliteTable("debate_personas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🙂"),
  role: text("role").notNull().default(""),
  stance: text("stance").notNull().default(""),
  tone: text("tone").notNull().default(""),
  color: text("color").notNull().default("#1F6C9F"),
  systemPrompt: text("system_prompt").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type DebateSessionRow = typeof debateSessions.$inferSelect;
export type NewDebateSessionRow = typeof debateSessions.$inferInsert;
export type DebateMessageRow = typeof debateMessages.$inferSelect;
export type NewDebateMessageRow = typeof debateMessages.$inferInsert;
export type DebatePersonaRow = typeof debatePersonas.$inferSelect;
export type NewDebatePersonaRow = typeof debatePersonas.$inferInsert;
```

- [ ] **Step 2: `app/drizzle/0010_debate_room.sql` 작성**

```sql
CREATE TABLE `debate_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `brief` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `duration_sec` integer DEFAULT 180 NOT NULL,
  `participant_keys` text DEFAULT '[]' NOT NULL,
  `round` integer DEFAULT 0 NOT NULL,
  `turn_count` integer DEFAULT 0 NOT NULL,
  `max_turns` integer DEFAULT 80 NOT NULL,
  `verdict` text,
  `report_path` text,
  `created_by` text,
  `started_at` integer,
  `ended_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `debate_sessions_status_idx` ON `debate_sessions` (`status`);
--> statement-breakpoint
CREATE TABLE `debate_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `seq` integer NOT NULL,
  `persona_key` text NOT NULL,
  `persona_name` text NOT NULL,
  `persona_emoji` text DEFAULT '' NOT NULL,
  `persona_color` text DEFAULT '#1F6C9F' NOT NULL,
  `kind` text DEFAULT 'member' NOT NULL,
  `round` integer DEFAULT 1 NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `debate_sessions`(`id`)
);
--> statement-breakpoint
CREATE INDEX `debate_messages_session_idx` ON `debate_messages` (`session_id`,`seq`);
--> statement-breakpoint
CREATE TABLE `debate_personas` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `emoji` text DEFAULT '🙂' NOT NULL,
  `role` text DEFAULT '' NOT NULL,
  `stance` text DEFAULT '' NOT NULL,
  `tone` text DEFAULT '' NOT NULL,
  `color` text DEFAULT '#1F6C9F' NOT NULL,
  `system_prompt` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_by` text,
  `created_at` integer NOT NULL
);
```

- [ ] **Step 3: `_journal.json` 에 엔트리 추가** (배열 마지막에)

```json
    {
      "idx": 10,
      "version": "6",
      "when": 1789500000000,
      "tag": "0010_debate_room",
      "breakpoints": true
    }
```

- [ ] **Step 4: `index.ts` 안전망 추가** (`work_tasks` 블록 뒤, 같은 try/catch 스타일)

```ts
// Debate Room(019) 물리 테이블 보장
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS debate_sessions (
    id text PRIMARY KEY NOT NULL, title text NOT NULL, brief text DEFAULT '' NOT NULL,
    status text DEFAULT 'draft' NOT NULL, duration_sec integer DEFAULT 180 NOT NULL,
    participant_keys text DEFAULT '[]' NOT NULL, round integer DEFAULT 0 NOT NULL,
    turn_count integer DEFAULT 0 NOT NULL, max_turns integer DEFAULT 80 NOT NULL,
    verdict text, report_path text, created_by text, started_at integer, ended_at integer,
    created_at integer NOT NULL, updated_at integer NOT NULL);
  CREATE INDEX IF NOT EXISTS debate_sessions_status_idx ON debate_sessions (status);
  CREATE TABLE IF NOT EXISTS debate_messages (
    id text PRIMARY KEY NOT NULL, session_id text NOT NULL, seq integer NOT NULL,
    persona_key text NOT NULL, persona_name text NOT NULL, persona_emoji text DEFAULT '' NOT NULL,
    persona_color text DEFAULT '#1F6C9F' NOT NULL, kind text DEFAULT 'member' NOT NULL,
    round integer DEFAULT 1 NOT NULL, content text NOT NULL, created_at integer NOT NULL);
  CREATE INDEX IF NOT EXISTS debate_messages_session_idx ON debate_messages (session_id, seq);
  CREATE TABLE IF NOT EXISTS debate_personas (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, emoji text DEFAULT '🙂' NOT NULL,
    role text DEFAULT '' NOT NULL, stance text DEFAULT '' NOT NULL, tone text DEFAULT '' NOT NULL,
    color text DEFAULT '#1F6C9F' NOT NULL, system_prompt text DEFAULT '' NOT NULL,
    active integer DEFAULT 1 NOT NULL, created_by text, created_at integer NOT NULL);`);
} catch { /* 무시 */ }
```

- [ ] **Step 5: 테이블 생성 확인**

Run: `cd app && node -e "const D=require('better-sqlite3');const db=new D('data/dept.db');db.exec(require('fs').readFileSync('drizzle/0010_debate_room.sql','utf8').split('--> statement-breakpoint').join(';'));console.log(db.prepare(\"select name from sqlite_master where name like 'debate%'\").all())"`
Expected: `[ { name: 'debate_sessions' }, { name: 'debate_messages' }, { name: 'debate_personas' } ]` (개발 DB 즉시 반영)

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/db/schema.ts app/src/lib/db/index.ts app/drizzle/0010_debate_room.sql app/drizzle/meta/_journal.json
git commit -m "feat(debate): 토론방 테이블 3종(세션·발언·커스텀 페르소나) 스키마/마이그레이션 추가"
```

---

### Task T02: 기본 페르소나 카탈로그 (10종)

**Files:**
- Create: `app/src/lib/debate/types.ts`
- Create: `app/src/lib/debate/personas.ts`
- Test: `app/src/tests/debate-personas.test.ts`

**Interfaces:**
- Consumes: 없음(순수 모듈).
- Produces:
  - `type DebatePersonaKind = "member" | "observer" | "conclusion"`
  - `type DebatePersona = { key: string; name: string; emoji: string; role: string; stance: string; tone: string; color: string; kind: DebatePersonaKind; builtin: boolean; systemPrompt: string }`
  - `const BUILTIN_DEBATE_PERSONAS: DebatePersona[]`
  - `const CONCLUSION_PERSONA_KEY = "synthesizer"`
  - `function getDebatePersona(key: string): DebatePersona | undefined`
  - `function isConclusionPersona(p: DebatePersona): boolean`
  - `function debateModePersonas(): DebatePersona[]` — 토론 발언자(결론 제외)
  - `function defaultParticipantKeys(): string[]` — 팀장 2 + 그룹장 + 긍정 + 비판 (5명)

- [ ] **Step 1: 실패 테스트 작성** `app/src/tests/debate-personas.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { BUILTIN_DEBATE_PERSONAS, getDebatePersona, isConclusionPersona, debateModePersonas, defaultParticipantKeys, CONCLUSION_PERSONA_KEY } from "@/lib/debate/personas";

describe("기본 페르소나 카탈로그", () => {
  it("요구된 10종이 모두 있다", () => {
    const names = BUILTIN_DEBATE_PERSONAS.map((p) => p.name);
    for (const n of ["보험금기획팀장", "보험금심사팀장", "그룹장님", "인사", "재무", "IT개발", "금감원", "긍정적 에이전트", "냉철한 비판가 에이전트", "최종 결론 에이전트"]) {
      expect(names).toContain(n);
    }
    expect(BUILTIN_DEBATE_PERSONAS.length).toBe(10);
  });

  it("key는 중복 없고, 최종 결론 에이전트는 kind가 conclusion 이다", () => {
    const keys = BUILTIN_DEBATE_PERSONAS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const c = getDebatePersona(CONCLUSION_PERSONA_KEY);
    expect(c?.kind).toBe("conclusion");
    expect(isConclusionPersona(c!)).toBe(true);
    expect(BUILTIN_DEBATE_PERSONAS.filter((p) => p.kind === "conclusion").length).toBe(1);
  });

  it("토론 발언자 목록은 결론 에이전트를 제외한다", () => {
    expect(debateModePersonas().some((p) => p.kind === "conclusion")).toBe(false);
  });

  it("기본 참가자는 2명 이상이며 모두 실재하는 key다", () => {
    const keys = defaultParticipantKeys();
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const k of keys) expect(getDebatePersona(k)).toBeDefined();
  });

  it("금감원은 옵저버 kind다", () => {
    expect(getDebatePersona("fss")?.kind).toBe("observer");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app && npx vitest run src/tests/debate-personas.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/debate/personas"`

- [ ] **Step 3: `types.ts` 작성**

```ts
// 토론방 공용 타입
export type DebateStatus = "draft" | "running" | "finished" | "stopped" | "failed";
export type DebatePersonaKind = "member" | "observer" | "conclusion";

export type DebatePersona = {
  key: string;
  name: string;
  emoji: string;
  role: string;
  stance: string;
  tone: string;
  color: string;
  kind: DebatePersonaKind;
  builtin: boolean;
  systemPrompt: string;
};

export type DebateParticipant = {
  key: string; name: string; emoji: string; color: string; role: string; kind: DebatePersonaKind;
};

export type DebateMessage = {
  id: string; sessionId: string; seq: number;
  personaKey: string; personaName: string; personaEmoji: string; personaColor: string;
  kind: DebatePersonaKind | "system"; round: number; content: string; createdAt: string;
};

export type DebateSession = {
  id: string; title: string; brief: string; status: DebateStatus;
  durationSec: number; participantKeys: string[]; participants: DebateParticipant[];
  round: number; turnCount: number; maxTurns: number;
  verdict: string | null; reportPath: string | null; hasReport: boolean;
  createdBy: string | null; startedAt: string | null; endedAt: string | null;
  createdAt: string; updatedAt: string;
};

export type DebateSynthesis = {
  verdict: string;
  summary: string;
  agreements: string[];
  disputes: { issue: string; pro: string; con: string }[];
  risks: string[];
  actions: { what: string; owner: string; due: string }[];
  positions: { persona: string; keyPoint: string }[];
};
```

- [ ] **Step 4: `personas.ts` 작성** — 10종 정의(요약: 아래 표) + 헬퍼 4개

```ts
import type { DebatePersona } from "./types";

// 공통 톤 규칙: 실제 회의처럼 짧게(2~4문장), 앞사람 주장을 1회 인용해 반응, 새 근거 1개 이상.
const COMMON = `
[토론 규칙]
- 2~4문장으로 짧게 발언한다. 인사말·서론 없이 바로 본론.
- 직전 발언 중 하나를 "(○○ 주장)" 처럼 지목해 반응한 뒤 내 주장을 편다.
- 근거 없는 단정 금지. 가능하면 수치·사례·규정 중 하나를 제시한다.
- 상대를 인신공격하지 않고 주장과 근거를 공격/보완한다.
- 마지막에 필요하면 상대에게 질문 1개를 던진다.`;

export const CONCLUSION_PERSONA_KEY = "synthesizer";

export const BUILTIN_DEBATE_PERSONAS: DebatePersona[] = [
  { key: "claims-planning-lead", name: "보험금기획팀장", emoji: "🧭", role: "보험금기획팀장", color: "#1F6C9F",
    stance: "부서 실행 관점에서 실현 가능성과 일정을 따진다.", tone: "차분한 실무 리더",
    kind: "member", builtin: true,
    systemPrompt: `당신은 신한라이프 보험금기획팀장입니다. ${COMMON}\n- 심사·지급 프로세스, 손해율, 일정/리소스를 근거로 실현 가능성을 판단합니다.` },
  { key: "claims-review-lead", name: "보험금심사팀장", emoji: "🔎", role: "보험금심사팀장", color: "#346538",
    stance: "현장 심사 기준과 민원·분쟁 리스크를 본다.", tone: "현장 밀착형",
    kind: "member", builtin: true,
    systemPrompt: `당신은 신한라이프 보험금심사팀장입니다. ${COMMON}\n- 현장 심사 기준, 오지급·민원·분쟁 사례를 근거로 반대 근거를 제시합니다.` },
  { key: "group-head", name: "그룹장님", emoji: "🏛", role: "그룹장", color: "#5A4B8A",
    stance: "그룹 전략·타 부서 영향·의사결정 우선순위를 본다.", tone: "결정권자",
    kind: "member", builtin: true,
    systemPrompt: `당신은 그룹장입니다. ${COMMON}\n- 그룹 전략, 타 부서 협업, 투자 우선순위를 근거로 판단하고 필요 시 의사결정을 압박합니다.` },
  { key: "hr", name: "인사", emoji: "🧑‍💼", role: "인사팀", color: "#8A6116",
    stance: "조직·인력·평가·노무 영향을 본다.", tone: "보수적 실무",
    kind: "member", builtin: true,
    systemPrompt: `당신은 인사팀 담당자입니다. ${COMMON}\n- 인력 재배치, 직무 변화, 평가·보상, 노무 이슈를 근거로 제시합니다.` },
  { key: "finance", name: "재무", emoji: "💰", role: "재무팀", color: "#1F6C9F",
    stance: "비용·예산·수익성으로 따진다.", tone: "숫자 중심",
    kind: "member", builtin: true,
    systemPrompt: `당신은 재무팀 담당자입니다. ${COMMON}\n- 도입 비용, 예산 한도, 손익·ROI를 수치로 따지고 비용 없는 대안을 요구합니다.` },
  { key: "it-dev", name: "IT개발", emoji: "🛠", role: "IT개발팀", color: "#3F7D8C",
    stance: "시스템·데이터·개발 공수 관점.", tone: "기술 실무",
    kind: "member", builtin: true,
    systemPrompt: `당신은 IT개발팀 담당자입니다. ${COMMON}\n- 시스템 변경 범위, 데이터 정합성, 개발 공수, 운영 리스크를 근거로 제시합니다.` },
  { key: "fss", name: "금감원", emoji: "👮", role: "감독당국 관점", color: "#A03A3A",
    stance: "규제·소비자보호·감독 리스크를 지적한다.", tone: "엄격한 심사자",
    kind: "observer", builtin: true,
    systemPrompt: `당신은 감독당국(금융감독원) 관점의 검토자입니다. ${COMMON}\n- 약관·규정 위반 소지, 소비자보호, 분쟁·제재 리스크를 근거로 지적합니다.` },
  { key: "optimist", name: "긍정적 에이전트", emoji: "🌤", role: "기회 탐색", color: "#B07A16",
    stance: "기대효과·기회를 최대화해 본다.", tone: "낙관적 추진파",
    kind: "member", builtin: true,
    systemPrompt: `당신은 낙관적 기회 탐색 에이전트입니다. ${COMMON}\n- 이 안이 성공했을 때의 기대효과, 확장 가능성, 선점 이점을 구체적으로 부각합니다.` },
  { key: "critic", name: "냉철한 비판가 에이전트", emoji: "🧊", role: "리스크 비판", color: "#3A3A3A",
    stance: "허점·가정·실패 시나리오를 파고든다.", tone: "냉소적 검증자",
    kind: "member", builtin: true,
    systemPrompt: `당신은 냉철한 비판가 에이전트입니다. ${COMMON}\n- 숨은 가정, 실패 시나리오, 비용·일정 과소평가, 대안 부재를 집요하게 지적합니다.` },
  { key: "synthesizer", name: "최종 결론 에이전트", emoji: "📌", role: "사회·결론", color: "#1F6C9F",
    stance: "쟁점을 정리해 합의와 미해결을 가른다.", tone: "중립적 정리자",
    kind: "conclusion", builtin: true,
    systemPrompt: `당신은 토론의 최종 결론 에이전트입니다. 토론 중에는 발언하지 않고, 종료 후 전체 발언을 읽고 합의/쟁점/리스크/권고 액션을 정리합니다.` },
];

export function getDebatePersona(key: string): DebatePersona | undefined {
  return BUILTIN_DEBATE_PERSONAS.find((p) => p.key === key);
}
export function isConclusionPersona(p: DebatePersona): boolean { return p.kind === "conclusion"; }
export function debateModePersonas(): DebatePersona[] { return BUILTIN_DEBATE_PERSONAS.filter((p) => p.kind !== "conclusion"); }
export function defaultParticipantKeys(): string[] {
  return ["claims-planning-lead", "claims-review-lead", "group-head", "critic", "optimist"];
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd app && npx vitest run src/tests/debate-personas.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/debate/types.ts app/src/lib/debate/personas.ts app/src/tests/debate-personas.test.ts
git commit -m "feat(debate): 기본 페르소나 10종 카탈로그 + 헬퍼/테스트"
```

---

### Task T03: 토론 저장소 (세션·발언 인메모리 인덱스)

**Files:**
- Create: `app/src/lib/debate/store.ts`
- Modify: `app/src/tests/helpers.ts` (resetDb 에 debate 테이블 삭제)
- Test: `app/src/tests/debate-store.test.ts`

**Interfaces:**
- Consumes: `schema`, `db`, `DebateParticipant`, `getDebatePersona`.
- Produces:
  - `createSession(input: { id: string; title: string; brief: string; durationSec: number; participantKeys: string[]; createdBy: string | null }): Promise<DebateSession>`
  - `getSession(id: string): Promise<DebateSession | null>`
  - `listSessions(opts?: { limit?: number }): Promise<DebateSession[]>`
  - `setSessionStatus(id: string, status: DebateStatus, patch?: Partial<Pick<...>>): Promise<void>`
  - `appendMessage(input: { sessionId: string; persona: DebateParticipant; content: string; round: number; kind?: ... }): Promise<DebateMessage>` — `seq` 자동 증가
  - `listMessages(sessionId: string, sinceSeq = 0): Promise<DebateMessage[]>`
  - `nextSeq(sessionId: string): Promise<number>`
  - `countMessages(sessionId: string): Promise<number>`
  - `sessionToDto(row): DebateSession` (participantKeys → participants 해석)

- [ ] **Step 1: 실패 테스트** `app/src/tests/debate-store.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withUser } from "./helpers";
import { createSession, getSession, listSessions, appendMessage, listMessages, setSessionStatus } from "@/lib/debate/store";

beforeEach(async () => { await resetDb(); });

async function mk() {
  const u = await withUser({ role: "user" });
  return createSession({ id: "s1", title: "신규 기획안", brief: "AI 자동심사 확대", durationSec: 180, participantKeys: ["critic", "optimist"], createdBy: u.id });
}

describe("debate store", () => {
  it("세션 생성/조회: 참가자 정보가 해석되어 내려온다", async () => {
    const s = await mk();
    expect(s.status).toBe("draft");
    expect(s.participants.map((p) => p.key)).toEqual(["critic", "optimist"]);
    expect(s.participants[0].name).toBe("냉철한 비판가 에이전트");
    const got = await getSession("s1");
    expect(got?.title).toBe("신규 기획안");
  });

  it("발언 append 는 seq 를 1부터 증가시킨다", async () => {
    await mk();
    const critic = { key: "critic", name: "냉철한 비판가 에이전트", emoji: "🧊", color: "#3A3A3A", role: "리스크 비판", kind: "member" as const };
    const a = await appendMessage({ sessionId: "s1", persona: critic, content: "가정이 틀렸습니다.", round: 1 });
    const b = await appendMessage({ sessionId: "s1", persona: critic, content: "비용이 과소평가됐습니다.", round: 1 });
    expect(a.seq).toBe(1); expect(b.seq).toBe(2);
    expect((await listMessages("s1", 1)).map((m) => m.seq)).toEqual([2]);
  });

  it("상태 전환과 목록 정렬", async () => {
    await mk();
    await setSessionStatus("s1", "running", { startedAt: new Date() });
    const list = await listSessions();
    expect(list[0].status).toBe("running");
    expect(list[0].startedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd app && npx vitest run src/tests/debate-store.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: `helpers.ts` resetDb 에 추가**

```ts
  await db.delete(schema.debateMessages);
  await db.delete(schema.debateSessions);
  await db.delete(schema.debatePersonas);
```
(외래키 때문에 `debateMessages` 를 `debateSessions` 보다 먼저 삭제)

- [ ] **Step 4: `store.ts` 구현** — 핵심 규칙
  - `sessionToDto`: `participantKeys` JSON 파싱 → `getDebatePersona(key)` 로 이름/색/kind 해석, 없으면 skip.
  - `nextSeq`: `select max(seq)` → +1 (better-sqlite3 동기 트랜잭션이라 경쟁 없음. 단, 턴 루프는 단일 실행이므로 안전).
  - `appendMessage`: `id = randomUUID()`, `createdAt = new Date()`.
  - 모든 반환은 `DebateSession`/`DebateMessage` DTO(Date→ISO 문자열)로 변환.

- [ ] **Step 5: 통과 확인** — Run: `cd app && npx vitest run src/tests/debate-store.test.ts` → PASS(3)

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/debate/store.ts app/src/tests/helpers.ts app/src/tests/debate-store.test.ts
git commit -m "feat(debate): 토론 세션/발언 저장소 + 테스트"
```

---

### Task T04: 보고서 MD 조립 + 파일 저장/읽기

**Files:**
- Create: `app/src/lib/debate/storage.ts`
- Create: `app/src/lib/debate/report.ts`
- Test: `app/src/tests/debate-report.test.ts`

**Interfaces:**
- Consumes: `DebateSession`, `DebateMessage`, `DebateSynthesis`.
- Produces:
  - `debateReportPath(sessionId: string): string`
  - `saveDebateReportMd(sessionId: string, md: string): Promise<string>`
  - `readDebateReportMd(sessionId: string): Promise<string | null>`
  - `buildDebateReportMarkdown(input: { session: DebateSession; messages: DebateMessage[]; synthesis: DebateSynthesis }): string`
  - `parseSynthesis(raw: string): DebateSynthesis | null` (parseJsonLoose 사용, 필드 정규화)

- [ ] **Step 1: 실패 테스트** `app/src/tests/debate-report.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildDebateReportMarkdown, parseSynthesis } from "@/lib/debate/report";
import { saveDebateReportMd, readDebateReportMd, debateReportPath } from "@/lib/debate/storage";

const session = { id: "s1", title: "AI 자동심사 확대", brief: "300만원 이하 청구 자동심사 확대", status: "finished", durationSec: 180,
  participantKeys: ["critic", "optimist"], participants: [], round: 3, turnCount: 12, maxTurns: 80, verdict: "조건부 추진",
  reportPath: null, hasReport: false, createdBy: "u1", startedAt: null, endedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" } as any;
const msg = (seq: number, name: string, content: string) => ({ id: "m" + seq, sessionId: "s1", seq, personaKey: "critic", personaName: name, personaEmoji: "🧊", personaColor: "#333", kind: "member", round: 1, content, createdAt: "2026-10-01T00:00:00.000Z" });

describe("최종 보고서 MD", () => {
  it("필수 섹션을 모두 포함한다", () => {
    const md = buildDebateReportMarkdown({ session, messages: [msg(1, "비판가", "가정이 약하다")], synthesis: {
      verdict: "조건부 추진", summary: "요약", agreements: ["A"], disputes: [{ issue: "비용", pro: "찬성측", con: "반대측" }],
      risks: ["리스크1"], actions: [{ what: "파일럿", owner: "보험금기획", due: "2주" }], positions: [{ persona: "비판가", keyPoint: "가정 부족" }],
    } });
    for (const h of ["# 토론 최종 보고서", "## 1. 결론", "## 2. 합의된 사항", "## 3. 쟁점", "## 4. 리스크", "## 5. 권고 액션", "## 부록 A", "## 부록 B"]) {
      expect(md).toContain(h);
    }
    expect(md).toContain("조건부 추진");
    expect(md).toContain("| 비용 | 찬성측 | 반대측 |");
  });

  it("parseSynthesis 는 깨진/잘린 JSON 도 복원한다", () => {
    const j = parseSynthesis('설명\n```json\n{"verdict":"보류","summary":"s","agreements":["a"],"disputes":[{"issue":"i","pro":"p","con":"c"}],"risks":["r"],"actions":[{"what":"w","owner":"o","due":"d"}],"positions":[{"persona":"x","keyPoint":"k"');
    expect(j?.verdict).toBe("보류");
    expect(j?.positions[0].keyPoint).toBe("k");
  });

  it("JSON 이 없으면 null", () => { expect(parseSynthesis("그냥 텍스트")).toBeNull(); });

  it("파일 저장/읽기 왕복", async () => {
    const p = await saveDebateReportMd("sess-test", "# 제목\n본문");
    expect(p).toBe(debateReportPath("sess-test"));
    expect(await readDebateReportMd("sess-test")).toContain("# 제목");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd app && npx vitest run src/tests/debate-report.test.ts` → FAIL

- [ ] **Step 3: `storage.ts` 구현**

```ts
import path from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";

function dataDir(): string { return process.env.DATA_DIR ?? path.join(process.cwd(), "data"); }
export function debateReportPath(sessionId: string): string { return path.join(dataDir(), "debates", sessionId, "report.md"); }
export async function saveDebateReportMd(sessionId: string, md: string): Promise<string> {
  const p = debateReportPath(sessionId);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, md, "utf8");
  return p;
}
export async function readDebateReportMd(sessionId: string): Promise<string | null> {
  try { return await readFile(debateReportPath(sessionId), "utf8"); } catch { return null; }
}
```

- [ ] **Step 4: `report.ts` 구현** — `buildDebateReportMarkdown` 은 아래 템플릿을 그대로 채운다.
  섹션: `# 토론 최종 보고서 — {title}` / 메타(일시·소요·참가자·발언수) / `## 1. 결론 (판정: {verdict})` + summary / `## 2. 합의된 사항` 불릿 / `## 3. 쟁점` 표(`| 쟁점 | 찬성 | 반대 |`) / `## 4. 남은 리스크·미해결` 불릿 / `## 5. 권고 액션` 표(`| 할 일 | 담당 | 기한 |`) / `## 부록 A. 참가자별 핵심 주장` 불릿 / `## 부록 B. 발언 로그` (seq·이름·내용, 내용은 200자 절단).
  `parseSynthesis` 는 `parseJsonLoose` 결과에서 문자열/배열 필드를 방어적으로 정규화하고, `verdict` 또는 `summary` 가 없으면 `null`.

- [ ] **Step 5: 통과 확인** — Run: `cd app && npx vitest run src/tests/debate-report.test.ts` → PASS(4)

- [ ] **Step 6: 커밋**

```bash
git add app/src/lib/debate/storage.ts app/src/lib/debate/report.ts app/src/tests/debate-report.test.ts
git commit -m "feat(debate): 최종 보고서 MD 조립 + 파일 저장/읽기 + 파싱 테스트"
```

---

## Phase 2 — 토론 엔진

### Task T05: 페르소나별 모델 설정 (설정 화면 + API)

**Files:**
- Create: `app/src/lib/debate/models.ts`
- Create: `app/src/app/api/admin/models/personas/route.ts`
- Modify: `app/src/app/(app)/admin/settings/page.tsx` (용도별 모델 섹션 뒤에 "페르소나별 모델" 섹션 추가)
- Test: `app/src/tests/debate-models.test.ts`

**Interfaces:**
- Produces:
  - `const DEBATE_PERSONA_MODELS_KEY = "debate_persona_models"`
  - `type PersonaModelSource = "persona" | "default"`
  - `getPersonaModelOverrides(): Promise<Record<string, ModelSelection>>`
  - `setPersonaModelOverride(personaKey: string, selection: ModelSelection | null): Promise<void>`
  - `pickPersonaModel(personaKey: string, overrides: Record<string, ModelSelection>): ModelSelection | null` (순수)
  - `getPersonaModel(personaKey: string): Promise<{ selection: ModelSelection; source: PersonaModelSource }>`
  - `resolvePersonaModel(personaKey: string): Promise<{ models; model; selection; source }>`
  - `GET /api/admin/models/personas` → `{ defaultSelection, personas: [{ key, name, emoji, role, kind, builtin, override, effective, source }] }`
  - `PUT /api/admin/models/personas` body `{ overrides: { [key]: { model, gateway } | null } }` → `{ ok, applied }`

- [ ] **Step 1: 실패 테스트** — 저장 왕복/해제/gateway 정규화/pure pick 4케이스
- [ ] **Step 2: 실패 확인** — `cd app && npx vitest run src/tests/debate-models.test.ts` → FAIL
- [ ] **Step 3: `models.ts` 구현** — 저장은 `settings.ts` 의 `getSetting/setSetting`, 기본값 fallback 은 `getModelForPurpose("simple")`, 모델 인스턴스는 `buildModels(selection.model, selection.gateway)`
- [ ] **Step 4: API 라우트 구현** — 관리자 검증(`requireAdmin`), 알 수 없는 personaKey 는 400
- [ ] **Step 5: 설정 화면 섹션** — 페르소나 행마다 모델 select + "지정 해제" + 적용 중/(저장 대기) 표시. 모델 목록은 기존 "용도별 LLM 모델"의 게이트웨이 목록을 재사용
- [ ] **Step 6: 통과 확인** — `npx vitest run src/tests/debate-models.test.ts` PASS(4) + `npx tsc --noEmit`
- [ ] **Step 7: 커밋** `feat(debate): 페르소나별 모델 설정(설정 화면+API)`

---

### Task T06: 발언 프롬프트 + 발언자 선택(스케줄러)

**Files:**
- Create: `app/src/lib/debate/engine.ts` (1차: 프롬프트/스케줄러만)
- Test: `app/src/tests/debate-engine.test.ts`

**Interfaces:**
- Consumes: `DebatePersona`, `DebateMessage`, `DebateSession`.
- Produces:
  - `buildTurnPrompt(input: { session: DebateSession; persona: DebatePersona; transcript: DebateMessage[]; round: number; remainingSec: number }): string`
  - `pickNextSpeaker(input: { participants: DebatePersona[]; turnIndex: number; round: number }): { persona: DebatePersona; round: number }`
    - 규칙: `participants` 에서 `turnIndex % participants.length` 로 순환. **옵저버(kind="observer")는 라운드의 첫 발언으로 1회만** 등장하도록 `speakingOrder(participants)` 로 순서를 만든다(= 관찰자 먼저, 이후 일반 멤버). 한 바퀴 돌면 `round + 1`.
  - `speakingOrder(participants: DebatePersona[]): DebatePersona[]`

- [ ] **Step 1: 실패 테스트 추가**

```ts
import { describe, it, expect } from "vitest";
import { pickNextSpeaker, speakingOrder, buildTurnPrompt } from "@/lib/debate/engine";
import { BUILTIN_DEBATE_PERSONAS, getDebatePersona } from "@/lib/debate/personas";

const P = (k: string) => getDebatePersona(k)!;

describe("발언 순서", () => {
  it("옵저버가 먼저, 이후 일반 멤버 순서를 유지한다", () => {
    const order = speakingOrder([P("claims-planning-lead"), P("fss"), P("critic")]);
    expect(order.map((p) => p.key)).toEqual(["fss", "claims-planning-lead", "critic"]);
  });
  it("한 바퀴 돌면 라운드가 증가한다", () => {
    const parts = [P("critic"), P("optimist")];
    expect(pickNextSpeaker({ participants: parts, turnIndex: 0, round: 1 }).persona.key).toBe("critic");
    expect(pickNextSpeaker({ participants: parts, turnIndex: 1, round: 1 }).persona.key).toBe("optimist");
    const third = pickNextSpeaker({ participants: parts, turnIndex: 2, round: 1 });
    expect(third.persona.key).toBe("critic");
    expect(third.round).toBe(2);
  });
});

describe("발언 프롬프트", () => {
  it("안건·페르소나·직전 발언·남은 시간을 포함한다", () => {
    const session = { title: "AI 자동심사 확대", brief: "300만원 이하 자동심사 확대 검토", participantKeys: [], participants: [], status: "running", durationSec: 180, round: 1, turnCount: 1, maxTurns: 80, verdict: null, reportPath: null, hasReport: false, createdBy: null, startedAt: null, endedAt: null, createdAt: "", updatedAt: "", id: "s1" } as any;
    const transcript = [{ id: "m1", sessionId: "s1", seq: 1, personaKey: "critic", personaName: "냉철한 비판가 에이전트", personaEmoji: "🧊", personaColor: "#333", kind: "member", round: 1, content: "가정이 약합니다", createdAt: "" }] as any;
    const prompt = buildTurnPrompt({ session, persona: P("optimist"), transcript, round: 1, remainingSec: 120 });
    expect(prompt).toContain("AI 자동심사 확대");
    expect(prompt).toContain("긍정적 에이전트");
    expect(prompt).toContain("가정이 약합니다");
    expect(prompt).toContain("남은 토론 시간: 120초");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd app && npx vitest run src/tests/debate-engine.test.ts` → FAIL

- [ ] **Step 3: 구현 (engine.ts 상단부)**

```ts
import type { DebateMessage, DebatePersona, DebateSession } from "./types";

export function speakingOrder(participants: DebatePersona[]): DebatePersona[] {
  const observers = participants.filter((p) => p.kind === "observer");
  const members = participants.filter((p) => p.kind !== "observer");
  return [...observers, ...members];
}

export function pickNextSpeaker(input: { participants: DebatePersona[]; turnIndex: number; round: number }) {
  const order = speakingOrder(input.participants);
  const persona = order[input.turnIndex % order.length];
  const round = input.round + Math.floor(input.turnIndex / order.length);
  return { persona, round };
}

const TRANSCRIPT_LIMIT = 14; // 최근 14발언만 컨텍스트로 (토큰 보호)

export function buildTurnPrompt(input: { session: DebateSession; persona: DebatePersona; transcript: DebateMessage[]; round: number; remainingSec: number }): string {
  const recent = input.transcript.slice(-TRANSCRIPT_LIMIT)
    .map((m) => `[${m.seq}] ${m.personaName}: ${m.content}`).join("\n") || "(아직 발언 없음 — 첫 발언입니다)";
  return `${input.persona.systemPrompt}

[토론 안건] ${input.session.title}
[배경/기획안] ${input.session.brief || "(별도 배경 없음)"}
[라운드] ${input.round}  [남은 토론 시간: ${input.remainingSec}초]

[지금까지의 발언]
${recent}

위 흐름을 읽고, ${input.persona.name}으로서 다음 발언을 하세요. 발언문만 출력하고 이름표·머리말은 쓰지 마세요.`;
}
```

- [ ] **Step 4: 통과 확인** — Run: `cd app && npx vitest run src/tests/debate-engine.test.ts` → PASS(3)

- [ ] **Step 5: 커밋**

```bash
git add app/src/lib/debate/engine.ts app/src/tests/debate-engine.test.ts
git commit -m "feat(debate): 발언 순서 스케줄러 + 턴 프롬프트 빌더"
```

---

### Task T07: 턴 루프 + 종료/중단 + 결론 생성 (`runDebate`)

**Files:**
- Modify: `app/src/lib/debate/engine.ts` (아래 추가)
- Test: `app/src/tests/debate-engine.test.ts` (확장)

**Interfaces:**
- Produces:
  - `type DebateLlmCall = (prompt: string) => Promise<string>`
  - `type RunDebateDeps = { call?: DebateLlmCall; now?: () => number; sleep?: (ms: number) => Promise<void>; conclusion?: DebateLlmCall }`
  - `runDebate(sessionId: string, deps?: RunDebateDeps): Promise<{ status: DebateStatus; turns: number }>`
  - `concludeDebate(sessionId: string, deps?: RunDebateDeps): Promise<{ reportPath: string; synthesis: DebateSynthesis }>`
  - `isStopped(sessionId: string): Promise<boolean>` — DB status 가 `"stopped"` 또는 `"finished"` 면 true

- [ ] **Step 1: 실패 테스트 추가** (주입 call/now/sleep 으로 결정적·고속)

```ts
it("시간이 지나면 종료하고 보고서를 만든다", async () => {
  await createSession({ id: "s-run", title: "T", brief: "B", durationSec: 30, participantKeys: ["critic", "optimist"], createdBy: null });
  let clock = 0;
  const call = vi.fn(async (p: string) => (p.includes("최종 결론") || p.includes("종합") ? JSON.stringify({ verdict: "조건부", summary: "요약", agreements: ["a"], disputes: [], risks: [], actions: [], positions: [] }) : "발언입니다"));
  const res = await runDebate("s-run", { call, now: () => clock, sleep: async (ms) => { clock += ms; } });
  expect(res.status).toBe("finished");
  expect(res.turns).toBeGreaterThan(0);
  const s = await getSession("s-run");
  expect(s?.status).toBe("finished");
  expect(s?.verdict).toBe("조건부");
  expect(await readDebateReportMd("s-run")).toContain("# 토론 최종 보고서");
});

it("중단 플래그가 세워지면 즉시 종료하고 보고서를 만든다", async () => {
  await createSession({ id: "s-stop", title: "T", brief: "B", durationSec: 600, participantKeys: ["critic", "optimist"], createdBy: null });
  let calls = 0;
  const call = vi.fn(async (p: string) => {
    calls++;
    if (calls === 2) await setSessionStatus("s-stop", "stopped");
    if (p.includes("종합") || p.includes("최종 결론")) return JSON.stringify({ verdict: "중단", summary: "s", agreements: [], disputes: [], risks: [], actions: [], positions: [] });
    return "발언";
  });
  const res = await runDebate("s-stop", { call, now: () => 0, sleep: async () => {} });
  expect(res.status).toBe("stopped");
});
```

- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: 구현 (engine.ts 하단부)** — 구조

```ts
export async function runDebate(sessionId: string, deps: RunDebateDeps = {}): Promise<{ status: DebateStatus; turns: number }> {
  const call = deps.call ?? defaultCall;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const session = await getSession(sessionId);
  if (!session) throw new Error("토론 세션을 찾을 수 없습니다.");
  if (session.status === "running") return { status: "running", turns: session.turnCount };

  const participants = session.participants
    .map((p) => getDebatePersona(p.key))
    .filter((p): p is DebatePersona => !!p && p.kind !== "conclusion");
  if (participants.length < 2) throw new Error("토론 참가자가 2명 이상 필요합니다.");

  const startedMs = now();
  await setSessionStatus(sessionId, "running", { startedAt: new Date(startedMs), round: 1, turnCount: 0 });
  await appendSystemMessage(sessionId, `토론을 시작합니다. 주제: ${session.title} (제한 ${session.durationSec}초)`);

  let turnIndex = 0;
  let round = 1;
  let turns = 0;
  try {
    while (turns < session.maxTurns) {
      if (await isStopped(sessionId)) break;
      const elapsedSec = Math.floor((now() - startedMs) / 1000);
      const remainingSec = session.durationSec - elapsedSec;
      if (remainingSec <= 0) break;

      const { persona, round: r } = pickNextSpeaker({ participants, turnIndex, round });
      round = r;
      const transcript = await listMessages(sessionId, 0);
      const prompt = buildTurnPrompt({ session, persona, transcript, round, remainingSec });
      const content = (await call(prompt)).trim();
      if (content) {
        await appendMessage({ sessionId, persona: toParticipant(persona), content, round });
        turns++;
        await setSessionStatus(sessionId, "running", { round, turnCount: turns });
      }
      turnIndex++;
      await sleep(TURN_DELAY_MS); // 기본 900ms — 메신저처럼 순차 등장
    }
  } catch (e) {
    await setSessionStatus(sessionId, "failed");
    throw e;
  }

  const stopped = await isStopped(sessionId); // 상태가 stopped 면 중단
  if (!stopped) await setSessionStatus(sessionId, "finished", { endedAt: new Date(now()) });
  const { reportPath, synthesis } = await concludeDebate(sessionId, deps);
  return { status: stopped ? "stopped" : "finished", turns };
}
```

  - `TURN_DELAY_MS = 900` (테스트에서는 `sleep` 주입으로 즉시).
  - `concludeDebate`: 세션+전체 발언 로드 → `buildSynthesisPrompt`(`전체 발언 요약, JSON 스키마 텍스트 설명`) → `conclusion` call → `parseSynthesis` → 실패 시 휴리스틱 합성(마지막 발언 기반) → `buildDebateReportMarkdown` → `saveDebateReportMd` → `setSessionStatus(id, unchanged, { verdict, reportPath, endedAt })`.
  - `defaultCall`: `getLlmModel("simple")` + `completeSimple`. **추론 off 금지 모델 대응을 위해 `"response"` 는 쓰지 않는다.**
  - 오류 격리: 발언 1건 실패 시 `console.error` 후 다음 발언자로 진행(토론이 통째로 죽지 않게). 연속 실패 3회면 `failed`.

- [ ] **Step 4: 통과 확인** — Run: `cd app && npx vitest run src/tests/debate-engine.test.ts` → PASS(5)

- [ ] **Step 5: 커밋**

```bash
git add app/src/lib/debate/engine.ts app/src/tests/debate-engine.test.ts
git commit -m "feat(debate): 턴 루프·시간종료·중단·결론 보고서 생성"
```

---

## Phase 3 — API

### Task T08: 세션 생성/목록 API

**Files:** Create `app/src/app/api/debate/route.ts`; Test `app/src/tests/debate-api.test.ts`

**Interfaces:**
- `POST /api/debate` body `{ title, brief?, durationSec?, participantKeys? }` → `{ session }` (400: title 없음/참가자 2명 미만/미허용 시간)
- `GET /api/debate?limit=20` → `{ sessions }`

- [ ] **Step 1: 실패 테스트** — `withUser` 세션 쿠키로 `POST` 호출 → 201/200 + `session.participants.length >= 2`; `title` 누락 시 400; `durationSec: 99999` → 400 또는 900 클램프(택1: **900 으로 클램프**).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `requireUser` + rate limit(`checkRateLimit(req, "debate:"+user.id, 10)`) + `createSession`. `durationSec` 허용값 `[60,180,300,600,900]`, 그 외는 180 클램프. `participantKeys` 검증(존재하는 key, 결론 제외, 2~8명).
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat(debate): 토론 생성/목록 API`

### Task T09: 상세·증분 스트림(폴링) API

**Files:** Create `app/src/app/api/debate/[id]/route.ts`, `.../[id]/stream/route.ts`; Test 확장

**Interfaces:**
- `GET /api/debate/[id]` → `{ session, messages, hasReport }`
- `GET /api/debate/[id]/stream?since=N` → `{ status, round, turnCount, messages: DebateMessage[], hasReport, remainingSec }` (`since` 이후만, `seq` 오름차순)

- [ ] **Step 1: 실패 테스트** — 세션 1개 + 발언 2개 저장 후 `stream?since=1` → `messages` 길이 1, `status`/`remainingSec` 포함. 없는 id → 404.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `remainingSec = max(0, durationSec - floor((now-startedAt)/1000))`, `startedAt` 없으면 `durationSec`.
- [ ] **Step 4: 통과 확인** / [ ] **Step 5: 커밋** `feat(debate): 토론 상세·증분 폴링 API`

### Task T10: 시작/중단 API

**Files:** Create `.../[id]/start/route.ts`, `.../[id]/stop/route.ts`; Test 확장

**Interfaces:**
- `POST /api/debate/[id]/start` → 202 `{ started: true }`. 이미 running 이면 200 `{ started: false, reason: "already-running" }`.
- `POST /api/debate/[id]/stop` → 200 `{ status }`. running 이면 status 를 `"stopped"` 로 바꾸고, 루프가 다음 검사에서 종료 후 결론을 만든다.

- [ ] **Step 1: 실패 테스트** — start 후 `session.status === "running"`; stop 후 `"stopped"`. `runDebate` 는 `vi.mock("@/lib/debate/engine")` 로 대체(라우트는 실행만 트리거).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — 시작은 `after(() => runDebate(id).catch(...))` 로 응답을 막지 않는다(Next `after` 미지원 환경 폴백은 `void runDebate(...)`).
- [ ] **Step 4: 통과 확인** / [ ] **Step 5: 커밋** `feat(debate): 토론 시작/중단 API`

### Task T11: 보고서 열람/다운로드 + 페르소나 API

**Files:** Create `.../[id]/report/route.ts`, `.../personas/route.ts`; Test 확장

**Interfaces:**
- `GET /api/debate/[id]/report` → `{ md, path, verdict }`; `?download=1` → `text/markdown; charset=utf-8` + `Content-Disposition: attachment; filename="debate-<id>.md"`
- `GET /api/debate/personas` → `{ personas: (DebatePersona & { builtin })[] }` (기본 + DB 커스텀)
- `POST /api/debate/personas` body `{ name, emoji?, role?, stance?, tone?, color?, systemPrompt? }` → `{ persona }`

- [ ] **Step 1: 실패 테스트** — 리포트 없으면 404; 커스텀 페르소나 생성 후 목록에 포함되며 `builtin:false`.
- [ ] **Step 2: 실패 확인** / [ ] **Step 3: 구현** / [ ] **Step 4: 통과 확인** / [ ] **Step 5: 커밋** `feat(debate): 보고서 열람/다운로드 + 페르소나 API`

---

## Phase 4 — 관전 UI

### Task T12: 메뉴 등록 + 토론방 허브(생성 폼 · 지난 토론)

**Files:** Modify `app/src/lib/nav.ts`; Create `app/src/app/(app)/debate/page.tsx`, `PersonaPicker.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/debate`, `GET /api/debate/personas`
- Produces: 허브 화면. 카드: ① 안건 입력(제목 필수, 기획안 textarea) ② 페르소나 선택(칩 토글, 결론 에이전트 자동 포함, 커스텀 추가) ③ 토론 시간(60/180/300/600/900초 세그먼트) ④ "토론 시작" → 세션 생성 후 `/debate/<id>` 로 이동.

- [ ] **Step 1: nav 추가**

```ts
{ href: "/debate", label: "토론방", icon: "debate" },
```
`NAV_ICONS` 에 `debate: "M4 5h16v11H9l-5 4zM9 9h6M9 12h4"` 추가(채팅 아이콘과 구분되는 말풍선 2줄).

- [ ] **Step 2: 화면 구현** — 기존 `briefing/page.tsx` 톤(`doppel`, `card-core`, `font-serif`) 재사용. 목록에는 상태 배지(진행중/완료/중단), 시작 시각, 참가자 아바타, "보고서 보기" 링크.
- [ ] **Step 3: 수동 확인** — dev 서버에서 `/debate` 접속, 생성 폼 제출 시 세션 생성 + 이동.
- [ ] **Step 4: 커밋** `feat(debate): 토론방 메뉴 + 허브 화면(생성/지난 토론)`

### Task T13: 관전 화면 (실시간 메신저 타임라인)

**Files:** Create `app/src/app/(app)/debate/[id]/page.tsx`, `DebateStage.tsx`

**인터랙션 설계(관전 재미 요소):**
1. 상단 "스테이지 바": 안건 제목 + 참가자 아바타 줄(현재 발언자 링), 남은 시간 카운트다운(막대 + mm:ss), 발언 수/라운드, `중단` 버튼.
2. 중앙 타임라인: 말풍선형 메시지. 좌측 아바타(이모지+색), 이름/직함/라운드, 본문. 새 메시지는 `rise-in` 애니메이션으로 등장.
3. "발언 중…" 타이핑 인디케이터: `status==="running"` 이고 최근 2초 내 새 메시지가 없으면 다음 발언자 아바타 옆에 점 3개 애니메이션 표시.
4. 옵저버(금감원) 메시지는 경고 톤 배경, 결론/시스템 메시지는 가운데 정렬 구분선 형태.
5. 자동 스크롤(사용자가 위로 올려 읽는 중이면 자동 스크롤 중지 + "새 발언 N개" 버튼).
6. 종료 시 상단에 `최종 보고서` 탭 활성화 + 배너("토론이 종료되었습니다 — 결론 보기").

- [ ] **Step 1: 폴링 훅 구현** — `useEffect` 에서 1.2초 간격 `fetch(/api/debate/${id}/stream?since=${lastSeq})`. `document.hidden` 이면 5초로 완화. `status` 가 `finished|stopped|failed` 면 폴링 중지.
- [ ] **Step 2: 컴포넌트 구현** — 위 6개 요소.
- [ ] **Step 3: 수동 확인** — 실제 토론 1회 실행해 메시지가 순차 등장하는지, 중단 버튼이 동작하는지 확인.
- [ ] **Step 4: 커밋** `feat(debate): 관전 화면 — 실시간 타임라인·타이머·타이핑 인디케이터`

### Task T14: 최종 보고서 뷰 (MarkdownViewer + MD 다운로드)

**Files:** Create `app/src/app/(app)/debate/[id]/ReportView.tsx`; Modify `page.tsx`

- [ ] **Step 1: 구현** — `GET /api/debate/[id]/report` → `MarkdownViewer` 로 렌더. 상단에 판정 배지 + `MD 다운로드`(`<a href="?download=1">`). 보고서 없으면 "결론 생성 중…" + 폴링 재시도.
- [ ] **Step 2: 수동 확인** — 토론 종료 후 보고서 섹션 8개가 보이고 다운로드가 되는지.
- [ ] **Step 3: 커밋** `feat(debate): 최종 보고서 뷰(MD 뷰어)·다운로드`

### Task T15: 지난 토론 재열람 + 페르소나 관리

**Files:** Modify `app/src/app/(app)/debate/page.tsx`, `PersonaPicker.tsx`

- [ ] **Step 1: 구현** — 허브 목록에서 완료 토론 클릭 → `/debate/<id>?tab=report`. 커스텀 페르소나 추가 폼(이름/직함/입장/말투/색) → `POST /api/debate/personas` 후 선택 목록에 즉시 반영. 기본 페르소나는 "기본" 배지.
- [ ] **Step 2: 수동 확인** — 새로고침 후에도 커스텀 페르소나가 유지되는지.
- [ ] **Step 3: 커밋** `feat(debate): 지난 토론 재열람 + 커스텀 페르소나 관리`

---

## Phase 5 — 검증·문서

### Task T16: 통합 검증 + 데모 시나리오 + 문서

**Files:** Create `docs/features/f009-토론방.md`; Modify `README.md`

- [ ] **Step 1: 전체 게이트** — `cd app && npx tsc --noEmit` exit 0, `npx vitest run` 전체 통과(현재 294 + debate 신규).
- [ ] **Step 2: 라이브 스모크(실제 LLM)** — `POST /api/debate`(안건: "300만원 이하 청구 AI 자동심사 확대") → `start` → 60초 토론 → `GET .../report` 에 8개 섹션과 `verdict` 존재 확인. 관전 화면에서 메시지 순차 등장 확인.
- [ ] **Step 3: 문서 작성** — `docs/features/f009-토론방.md`: 목적/사용법/데이터 모델/엔진 규칙/기본 페르소나 10종 표/확정 기본값/향후(SSE·사회자 LLM·투표).
- [ ] **Step 4: 커밋** `docs(debate): 토론방 기능 문서 + README`

---

## Self-Review

**1. Spec coverage(요구 → Task)**
- 요구1 여러 페르소나 생성·선택, 기본 10종 → T02(기본 카탈로그·헬퍼), T01/T10(커스텀 페르소나 DB·API), T11/T14(선택·관리 UI) ✅
- 요구2 토론 시간 설정·자동 종료·최종 결론 에이전트 보고서, MD 파일 생성·MD 뷰어 표시 → T01(durationSec), T06(종료/결론), T04(MD 생성·저장), T13(MarkdownViewer 표시·다운로드) ✅
- 요구3 최종 결과 파일 조회·재열람 → T10(리포트 API), T14(지난 토론 재열람) ✅
- 요구4 관전 UI/UX → T12(타이머·타이핑 인디케이터·아바타 링·자동 스크롤·경고 톤), T11(허브) ✅
- 실시간성 → T08(증분 폴링), T12(1.2초 폴링) ✅

**2. Placeholder scan** — "적절히 처리", "TBD" 없음. 모든 Task 가 실제 파일 경로·시그니처·테스트 코드를 포함한다.

**3. Type consistency 점검**
- `DebatePersona.kind` = `"member" | "observer" | "conclusion"` (T02) ↔ `DebateMessage.kind` 는 `... | "system"` (T02) ↔ `debateMessages.kind` enum 동일 (T01) ✅
- `pickNextSpeaker({ participants, turnIndex, round })` (T05) ↔ T07 호출부 동일 시그니처 ✅
- `runDebate`/`concludeDebate` 반환 타입 (T06) ↔ T10 라우트 사용부 ✅
- `buildDebateReportMarkdown({ session, messages, synthesis })` (T04) ↔ T06 결론 생성 호출부 동일 ✅
- `appendMessage({ sessionId, persona, content, round })` (T03) ↔ T07 호출부 동일 ✅

**4. 미해결/후속(명시)**
- SSE 전환, LLM 사회자(발언권 배분), 관전자 투표/개입, 토론 결과를 지식하네스 후보로 승격 — 본 계획 범위 밖(문서에 향후 항목으로 기록).
