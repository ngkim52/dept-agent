import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(path.join(dir, "dept.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
