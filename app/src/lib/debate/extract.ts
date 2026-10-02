// 토론방 기획안 파일 → 텍스트 추출 (019)
// - 텍스트 계열(txt/md/csv/json/html/xml 등): UTF-8 그대로
// - .docx: ZIP 컨테이너에서 word/document.xml 을 꺼내 텍스트만 추출 (외부 의존성 없이 zlib 사용)
// - 그 외(pdf/pptx/xls 등): 추출 실패 → 안내 메시지와 함께 빈 텍스트
import { inflateRawSync } from "node:zlib";

const TEXT_EXT = /(^text\/)|(\.(txt|md|markdown|csv|tsv|json|log|xml|html?|yaml|yml|sql|ts|tsx|js|jsx|py))$/i;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_TEXT_CHARS = 60_000;

export type ExtractResult = { text: string; note?: string };

/** ZIP(중앙 디렉터리) 안의 항목을 이름으로 찾아 바이트로 반환 */
export function readZipEntry(buf: Buffer, entryName: string): Buffer | null {
  // EOCD 찾기 (뒤에서부터)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf-8", p + 46, p + 46 + nameLen);
    if (name === entryName) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) { try { return inflateRawSync(raw); } catch { return null; } }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function stripXml(xml: string): string {
  // 문단/줄바꿈 보존 후 태그 제거
  const withBreaks = xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t");
  const text = withBreaks.replace(/<[^>]+>/g, "");
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function docxText(buf: Buffer): string | null {
  const doc = readZipEntry(buf, "word/document.xml");
  if (!doc) return null;
  return stripXml(doc.toString("utf-8"));
}

/** 업로드 파일 → 기획안 텍스트 */
export function extractTextFromFile(filename: string, buf: Buffer): ExtractResult {
  if (!buf || buf.length === 0) return { text: "", note: "빈 파일입니다." };
  if (buf.length > MAX_UPLOAD_BYTES) return { text: "", note: "10MB 이하 파일만 업로드할 수 있습니다." };

  if (TEXT_EXT.test(filename)) {
    const text = buf.toString("utf-8").replace(/^\uFEFF/, "").slice(0, MAX_TEXT_CHARS);
    return { text, note: text ? undefined : "파일에서 텍스트를 찾지 못했습니다." };
  }
  if (/\.docx$/i.test(filename)) {
    const text = docxText(buf);
    if (!text) return { text: "", note: "docx 본문을 읽지 못했습니다. 다른 형식으로 시도해 주세요." };
    return { text: text.slice(0, MAX_TEXT_CHARS), note: text.length > MAX_TEXT_CHARS ? "일부만 반영했습니다." : undefined };
  }
  if (/\.doc$/i.test(filename) || /\.pdf$/i.test(filename)) {
    return { text: "", note: "pdf/구형 doc 은 지원하지 않습니다. 텍스트를 복사해 붙여넣거나 .docx 로 올려주세요." };
  }
  return { text: "", note: "지원 형식: txt, md, csv, json, html, docx (그 외는 본문을 붙여넣어 주세요)" };
}
