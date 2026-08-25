// 업로드 파일 저장소 — 원본 바이너리를 DATA_DIR/uploads/<docId>/ 에 보존
// "@파일명" 지정 시 파이썬 데이터 툴(pandas/openpyxl)이 이 파일을 직접 읽어 엑셀/CSV 처리
import path from "node:path";
import fs from "node:fs";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";

const UPLOAD_DIR = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "uploads");

export function uploadDir(docId: string): string {
  return path.join(UPLOAD_DIR, docId);
}

export function uploadPath(docId: string): string {
  return path.join(uploadDir(docId), "file");
}

/** 업로드 바이너리 저장 (docId 폴더에 file 로 저장) */
export async function saveUpload(docId: string, buf: Uint8Array): Promise<string> {
  const dir = uploadDir(docId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "file"), buf);
  // 원본 파일명 보존 (pandas 파일 형식 판별용 확장자)
  return uploadPath(docId);
}

/** 업로드 바이너리 읽기 */
export async function readUpload(docId: string): Promise<Buffer | null> {
  try {
    return await readFile(uploadPath(docId));
  } catch {
    return null;
  }
}

/** 업로드 삭제 */
export async function deleteUpload(docId: string): Promise<void> {
  await unlink(uploadPath(docId)).catch(() => {});
  await unlink(path.join(uploadDir(docId), "name")).catch(() => {});
  // 빈 디렉터리 정리
  try { fs.rmdirSync(uploadDir(docId)); } catch { /* noop */ }
}

/** 원본 파일명 저장 (확장자 판별용) */
export async function saveUploadName(docId: string, filename: string): Promise<void> {
  await mkdir(uploadDir(docId), { recursive: true });
  await writeFile(path.join(uploadDir(docId), "name"), filename);
}

/** docId → 원본 파일명 */
export async function getUploadName(docId: string): Promise<string | null> {
  try {
    return (await readFile(path.join(uploadDir(docId), "name"), "utf8")) || null;
  } catch {
    return null;
  }
}
