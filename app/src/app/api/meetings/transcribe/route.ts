import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";

/** POST /api/meetings/transcribe — 오디오 업로드 → 전사 텍스트. STT 미설정: 텍스트 파일은 본문 디코딩, 음성은 안내. */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError(new HttpError(400, "multipart 필요"));
    const file = form.get("file");
    if (!(file instanceof Blob)) return jsonError(new HttpError(400, "file 필요"));
    const buf = new Uint8Array(await file.arrayBuffer());
    const name = String(file.name || "");
    const type = String(file.type || "");
    // 텍스트 형태이면 그대로 반환 (더미/수동 대응, STT 대체 지점)
    if (/text|json|\.(txt|md|csv)$/.test(type) || /\.(txt|md|csv)$/.test(name)) {
      return Response.json({ ok: true, text: new TextDecoder().decode(buf), note: "텍스트로 인식된 원문입니다." });
    }
    return Response.json({ ok: true, text: "", note: "STT(음성→텍스트) 미설정 — 회의 원문을 직접 붙여넣거나 텍스트 파일을 올려주세요." });
  } catch (e) { return jsonError(e); }
}
