import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { extractTextFromFile } from "@/lib/debate/extract";

// POST /api/debate/upload — 기획안 파일 업로드 → 텍스트 추출
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob) || !file.name || file.size === 0) throw new HttpError(400, "파일이 필요합니다.");

    const buf = Buffer.from(await file.arrayBuffer());
    const { text, note } = extractTextFromFile(file.name, buf);
    if (!text) return Response.json({ error: note ?? "파일에서 텍스트를 추출하지 못했습니다.", filename: file.name }, { status: 400 });

    // 원본 보관 (추후 재확인용)
    const dir = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "debates", "uploads", randomUUID());
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, file.name.replace(/[^\w가-힣.\-]+/g, "_")), buf).catch(() => {});

    return Response.json({ filename: file.name, text, chars: text.length, note });
  } catch (e) { return jsonError(e); }
}
