import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createHash } from "node:crypto";

// 드라이저 스키마 자동 생성 — 마이그레이션 폴더 기준 (첫 실행/기존 DB 모두 안전)
const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });

const migrationsFolder = path.join(process.cwd(), "drizzle");

const sqlite = new Database(path.join(dir, "dept.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };

// 모듈 로드 시 마이그레이션 수행 (없는 테이블만 생성, 멱등)
// 저널(__drizzle_migrations)이 비어 있어 스키마는 있으나 재실행되면 "table already exists"로
// 매 로드마다 실패·재실행이 반복될 수 있다. 스키마가 이미 완성된 경우엔 저널을 역으로
// 채워(백필) 멱등하게 만든다. (스키마가 진짜 없는 신규 DB는 migrate()가 정상 적용)

// 멀티턴 통합 Q/A 테이블 보장 (마이그레이션 0008 — 스키마만 있고 물리 테이블이 없는 안전망)
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS qa_consolidations (
    id text PRIMARY KEY NOT NULL,
    canonical_question text NOT NULL,
    intent text,
    merged_answer text NOT NULL,
    summary text,
    entities text,
    source_conversation_id text,
    status text DEFAULT 'draft' NOT NULL,
    confidence real DEFAULT 0.5 NOT NULL,
    turns integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    rag_document_id text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE INDEX IF NOT EXISTS qa_question_idx ON qa_consolidations (canonical_question);
  CREATE INDEX IF NOT EXISTS qa_status_idx ON qa_consolidations (status);
  CREATE TABLE IF NOT EXISTS qa_links (
    id text PRIMARY KEY NOT NULL,
    from_id text NOT NULL,
    to_id text NOT NULL,
    relation text NOT NULL,
    weight real DEFAULT 0.5 NOT NULL
  );
  CREATE INDEX IF NOT EXISTS qa_link_from_idx ON qa_links (from_id);`);
} catch { /* 무시 */ }


// 부서 워크큐(018-B) 물리 테이블 보장 — 마이그레이션 저널 백필에도 실제 테이블 있게
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS work_tasks (
    id text PRIMARY KEY NOT NULL,
    persona_key text DEFAULT 'claims-planning' NOT NULL,
    title text NOT NULL,
    assignee text,
    category text,
    due_date text,
    status text DEFAULT 'todo' NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'direct' NOT NULL,
    director_note_ref text,
    content text,
    rag_synced integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE INDEX IF NOT EXISTS wq_persona_idx ON work_tasks (persona_key);
  ;
  CREATE TABLE IF NOT EXISTS director_schedule (
    id text PRIMARY KEY NOT NULL,
    date text NOT NULL,
    time text,
    title text NOT NULL,
    note text,
    attendees text,
    location text,
    created_by text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE INDEX IF NOT EXISTS director_schedule_date_idx ON director_schedule (date);`);
} catch { /* 무시 */ }

// Debate Room(019) 물리 테이블 보장
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS debate_sessions (
    id text PRIMARY KEY NOT NULL, title text NOT NULL, brief text DEFAULT '' NOT NULL,
    status text DEFAULT 'draft' NOT NULL, duration_sec integer DEFAULT 180 NOT NULL,
    participant_keys text DEFAULT '[]' NOT NULL, round integer DEFAULT 0 NOT NULL,
    turn_count integer DEFAULT 0 NOT NULL, max_turns integer DEFAULT 80 NOT NULL,
    attachment_name text,
    verdict text, report_path text, created_by text, started_at integer, ended_at integer,
    created_at integer NOT NULL, updated_at integer NOT NULL);
  CREATE INDEX IF NOT EXISTS debate_sessions_status_idx ON debate_sessions (status);
  CREATE TABLE IF NOT EXISTS debate_messages (
    id text PRIMARY KEY NOT NULL, session_id text NOT NULL, seq integer NOT NULL,
    persona_key text NOT NULL, persona_name text NOT NULL, persona_emoji text DEFAULT '' NOT NULL,
    persona_color text DEFAULT '#1F6C9F' NOT NULL, kind text DEFAULT 'member' NOT NULL,
    round integer DEFAULT 1 NOT NULL, content text NOT NULL,
    emotion text, satisfaction integer, stance text, inner_thought text,
    created_at integer NOT NULL);
  CREATE INDEX IF NOT EXISTS debate_messages_session_idx ON debate_messages (session_id, seq);
  CREATE TABLE IF NOT EXISTS debate_personas (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, emoji text DEFAULT '🙂' NOT NULL,
    role text DEFAULT '' NOT NULL, stance text DEFAULT '' NOT NULL,
    expertise text DEFAULT '' NOT NULL, goal text DEFAULT '' NOT NULL, red_line text DEFAULT '' NOT NULL,
    tone text DEFAULT '' NOT NULL,
    color text DEFAULT '#1F6C9F' NOT NULL, system_prompt text DEFAULT '' NOT NULL,
    active integer DEFAULT 1 NOT NULL, created_by text, created_at integer NOT NULL);`);
} catch { /* 무시 */ }

// Debate Room 페르소나 필드/첨부파일 컬럼 보강 (0011) — 기존 DB에도 멱등 반영
try { sqlite.exec(`ALTER TABLE debate_sessions ADD COLUMN attachment_name text;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE debate_personas ADD COLUMN expertise text DEFAULT '' NOT NULL;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE debate_personas ADD COLUMN goal text DEFAULT '' NOT NULL;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE debate_personas ADD COLUMN red_line text DEFAULT '' NOT NULL;`); } catch { /* 이미 존재 */ }

// Debate Room 발언 상태(감정/만족도/입장/속마음) 컬럼 보강 (0012) — 기존 DB에도 멱등 반영
try { sqlite.exec(`ALTER TABLE debate_messages ADD COLUMN emotion text;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE debate_messages ADD COLUMN satisfaction integer;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE debate_messages ADD COLUMN stance text;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE debate_messages ADD COLUMN inner_thought text;`); } catch { /* 이미 존재 */ }

// director_schedule 컬럼 보강 (참석자·장소) — 기존 DB에도 멱등 반영
try { sqlite.exec(`ALTER TABLE director_schedule ADD COLUMN attendees text;`); } catch { /* 이미 존재 */ }
try { sqlite.exec(`ALTER TABLE director_schedule ADD COLUMN location text;`); } catch { /* 이미 존재 */ }

function syncMigrationJournal() {
  try {
    const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
    if (!fs.existsSync(journalPath)) return;
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const existStmt = sqlite.prepare("SELECT 1 FROM __drizzle_migrations WHERE hash = ?");
    const insStmt = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    const haveSchema = [
      "conversations", // 0000
      "knowledge_edges", // 0004 (최신)
    ].every((tb) => sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tb));
    if (!haveSchema) return; // 신규 DB — migrate()가 직접 적용할 것
    const t = String(Date.now());
    for (const e of journal.entries ?? []) {
      const file = path.join(migrationsFolder, e.tag + ".sql");
      if (!fs.existsSync(file)) continue;
      const hash = createHash("sha256").update(fs.readFileSync(file, "utf-8")).digest("hex");
      if (!existStmt.get(hash)) insStmt.run(hash, t); // hash에 유니크 제약이 없어 존재 확인 후 삽입 (멱등)
    }
  } catch {
    /* 저널 동기화 실패는 치명적이지 않음 */
  }
}
try {
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
    syncMigrationJournal();
  }
} catch (e) {
  // 초기 스키마 없이도 서버가 뜰 수 있도록 로그만 남기고 계속 (개발 대비)
  console.error("[db] 마이그레이션 실패(무시):", (e as Error).message);
  syncMigrationJournal();
}

// 첫 실행 편의: 기본 부서 보장 + (ADMIN_EMAIL/PASSWORD env 시) 관리자 계정 생성
// better-sqlite3는 동기라 빠르게 완료된다. (Docker 첫 실행 시 자동 관리자)
async function ensureSeed() {
  try {
    const { departments, users } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const DEPTS = [
      { id: "claims-planning", name: "보험금기획", personaKey: "claims-planning" },
    ];
    for (const dep of DEPTS) {
      const exists = await db.query.departments.findFirst({ where: eq(departments.id, dep.id) });
      if (!exists) {
        await db.insert(departments).values({ ...dep, isActive: true, createdAt: new Date() }).onConflictDoNothing();
      } else if (exists.name !== dep.name) {
        // 부서명 정정(예: 보험금심사기획 → 보험금기획)이 기존 DB에도 반영되도록 갱신
        await db.update(departments).set({ name: dep.name }).where(eq(departments.id, dep.id));
      }
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const { hashPassword } = await import("@/lib/auth/password");
      const admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
      if (!admin) {
        await db.insert(users).values({
          id: randomUUID(),
          email: adminEmail,
          name: "관리자",
          passwordHash: await hashPassword(adminPassword),
          role: "admin",
          status: "active",
          departmentId: DEPTS[0].id,
          createdAt: new Date(),
        });
        console.log("[db] 관리자 계정 생성:", adminEmail);
      }
    }
  } catch (e) {
    console.error("[db] 초기 데이터 보장 스킵:", (e as Error).message);
  }
}
void ensureSeed();
