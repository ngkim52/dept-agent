// 토론 최종 보고서 파일 저장소 — DATA_DIR/debates/<sessionId>/report.md (019)
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

export function debateReportDir(sessionId: string): string {
  return path.join(dataDir(), "debates", sessionId);
}

export function debateReportPath(sessionId: string): string {
  return path.join(debateReportDir(sessionId), "report.md");
}

export async function saveDebateReportMd(sessionId: string, md: string): Promise<string> {
  const p = debateReportPath(sessionId);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, md, "utf8");
  return p;
}

export async function readDebateReportMd(sessionId: string): Promise<string | null> {
  try {
    return await readFile(debateReportPath(sessionId), "utf8");
  } catch {
    return null;
  }
}
