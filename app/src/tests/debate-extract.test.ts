import { describe, it, expect } from "vitest";
import { extractTextFromFile, readZipEntry } from "@/lib/debate/extract";

/** 테스트용 최소 ZIP 생성기 (무압축 stored) */
function makeZip(entries: { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf-8");
    const data = Buffer.from(e.data, "utf-8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + data.length;
  }
  const local = Buffer.concat(locals);
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

describe("기획안 파일 텍스트 추출", () => {
  it("텍스트/마크다운/CSV 는 본문을 그대로 쓴다", () => {
    expect(extractTextFromFile("plan.md", Buffer.from("# 기획안\n내용", "utf-8")).text).toContain("기획안");
    expect(extractTextFromFile("data.csv", Buffer.from("a,b\n1,2", "utf-8")).text).toContain("1,2");
    expect(extractTextFromFile("note.txt", Buffer.from("\uFEFF본문", "utf-8")).text).toBe("본문");
  });

  it("docx 는 ZIP 안의 word/document.xml 에서 텍스트만 뽑는다", () => {
    const docXml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>자동심사 확대안</w:t></w:r></w:p><w:p><w:r><w:t>예산은 3억원</w:t></w:r></w:p></w:body></w:document>`;
    const zip = makeZip([{ name: "[Content_Types].xml", data: "<x/>" }, { name: "word/document.xml", data: docXml }]);
    expect(readZipEntry(zip, "word/document.xml")?.toString("utf-8")).toContain("자동심사");
    const r = extractTextFromFile("plan.docx", zip);
    expect(r.text).toContain("자동심사 확대안");
    expect(r.text).toContain("예산은 3억원");
    expect(r.text).not.toContain("<w:");
  });

  it("지원하지 않는 형식/빈 파일은 안내 메시지를 준다", () => {
    expect(extractTextFromFile("scan.pdf", Buffer.from("x")).text).toBe("");
    expect(extractTextFromFile("scan.pdf", Buffer.from("x")).note).toContain("pdf");
    expect(extractTextFromFile("a.txt", Buffer.alloc(0)).note).toBe("빈 파일입니다.");
    expect(extractTextFromFile("image.png", Buffer.from("x")).note).toContain("지원 형식");
  });
});
