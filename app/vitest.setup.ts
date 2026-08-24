// 테스트 전용 환경 변수 (실 DB/.env 사용 금지) + 마이그레이션 적용
import { rmSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dir = path.join(os.tmpdir(), "dept-agent-test-" + process.pid);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

process.env.DATA_DIR = dir;
process.env.DATABASE_URL = path.join(dir, "dept.db");
process.env.ALLOWED_EMAIL_DOMAINS = "shinhan.com,shinhanlife.co.kr";
process.env.LLM_BASE_URL = "http://llm.test/v1";
process.env.LLM_API_KEY = "test-key";
process.env.RAGFLOW_BASE_URL = "https://ragflow.test";
process.env.RAGFLOW_API_KEY = "test-key";

// 스키마 생성 (db:generate 산출물 적용)
const sqlite = new Database(path.join(dir, "dept.db"));
sqlite.pragma("journal_mode = WAL");
const mdb = drizzle(sqlite);
migrate(mdb, { migrationsFolder: path.resolve(__dirname, "drizzle") });
sqlite.close();

// 인메모리 레이트리밋은 테스트 간 공유되므로 매 테스트 전 초기화
import { beforeEach } from "vitest";
import { resetRateLimits } from "@/lib/auth/ratelimit";
beforeEach(() => resetRateLimits());
