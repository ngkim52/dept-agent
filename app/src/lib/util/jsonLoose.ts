// LLM이 반환한 JSON을 관용적으로 파싱하는 유틸.
//
// LLM 출력은 자주 망가진다:
//  - "```json … ```" 코드블록이나 앞뒤 설명이 섞인다
//  - 속성/원소 사이 콤마를 빠뜨린다 (Expected ',' or '}' after property value)
//  - trailing comma를 붙인다
//  - 문자열 안에 이스케이프되지 않은 개행·제어문자를 넣는다
//  - 토큰 한도로 출력이 문장 중간에 잘린다 (Unterminated string / Unexpected end)
//
// JSON.parse는 위 경우 전부 예외를 던져 파이프라인을 500으로 만든다.
// 이 모듈은 복원 가능한 마지막 값까지 최대한 살려 파싱하고, JSON이 전혀 없으면 null을 돌려준다.

/** 코드블록 펜스와 앞뒤 공백 제거 */
export function stripCodeFence(raw: string): string {
  const s = String(raw ?? "").trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : s).trim();
}

/** 첫 JSON 시작 문자({ 또는 [)의 위치. 없으면 -1 */
function firstJsonStart(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "[") return i;
  }
  return -1;
}

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

class TolerantParser {
  private s: string;
  private i = 0;
  constructor(s: string) { this.s = s; }

  parse(): any {
    const v = this.value();
    return v === undefined ? null : v;
  }

  private atEnd(): boolean { return this.i >= this.s.length; }

  /** 공백과 줄 주석(//), 블록 주석을 건너뛴다 */
  private skip(): void {
    while (!this.atEnd()) {
      const c = this.s[this.i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") { this.i++; continue; }
      if (c === "/" && this.s[this.i + 1] === "/") {
        this.i += 2;
        while (!this.atEnd() && this.s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "*") {
        this.i += 2;
        while (!this.atEnd() && !(this.s[this.i] === "*" && this.s[this.i + 1] === "/")) this.i++;
        this.i = Math.min(this.s.length, this.i + 2);
        continue;
      }
      break;
    }
  }

  /** 문자열 리터럴. 이스케이프와 문자열 내부 raw 제어문자를 허용하고, 미종료(잘림)면 지금까지를 반환 */
  private string(): string {
    const quote = this.s[this.i];
    this.i++; // opening quote
    let out = "";
    while (!this.atEnd()) {
      const c = this.s[this.i];
      if (c === "\\") {
        const n = this.s[this.i + 1];
        if (n === undefined) { this.i++; break; } // 잘림
        switch (n) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "u": {
            const hex = this.s.slice(this.i + 2, this.i + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); this.i += 6; continue; }
            out += n; break;
          }
          default: out += n; break;
        }
        this.i += 2;
        continue;
      }
      if (c === quote) { this.i++; return out; }
      // raw 제어문자(개행 등)도 문자열 값으로 허용
      out += c;
      this.i++;
    }
    return out; // 미종료 — 잘린 출력으로 간주
  }

  /** 콜론/콤마 전까지의 비인용 키 토큰 */
  private bareToken(): string {
    const start = this.i;
    while (!this.atEnd()) {
      const c = this.s[this.i];
      if (c === ":" || c === "," || c === "}" || c === "]" || c === "{" || c === "[") break;
      this.i++;
    }
    return this.s.slice(start, this.i).trim();
  }

  private object(): Record<string, any> {
    this.i++; // {
    const obj: Record<string, any> = {};
    while (true) {
      this.skip();
      if (this.atEnd()) return obj; // 잘림
      const c = this.s[this.i];
      if (c === "}") { this.i++; return obj; }
      if (c === ",") { this.i++; continue; } // trailing/중복 콤마

      const before = this.i;
      let key: string;
      if (c === '"' || c === "'") key = this.string();
      else key = this.bareToken();
      this.skip();
      if (this.s[this.i] === ":") this.i++; // 키만 있고 값이 잘린 경우 대비
      const val = this.value();
      if (key) obj[key] = val;
      this.skip();
      if (this.s[this.i] === ",") this.i++;
      if (this.i === before) this.i++; // 무한 루프 방지
    }
  }

  private array(): any[] {
    this.i++; // [
    const arr: any[] = [];
    while (true) {
      this.skip();
      if (this.atEnd()) return arr; // 잘림
      const c = this.s[this.i];
      if (c === "]") { this.i++; return arr; }
      if (c === ",") { this.i++; continue; }
      const before = this.i;
      const val = this.value();
      arr.push(val);
      this.skip();
      if (this.s[this.i] === ",") this.i++;
      if (this.i === before) this.i++;
    }
  }

  private value(): any {
    this.skip();
    if (this.atEnd()) return null;
    const c = this.s[this.i];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === '"' || c === "'") return this.string();
    // 리터럴/숫자/비인용 값
    const rest = this.s.slice(this.i);
    const num = rest.match(NUMBER_RE);
    if (num && num[0]) { this.i += num[0].length; return Number(num[0]); }
    const word = rest.match(/^(true|false|null)\b/i);
    if (word) {
      this.i += word[0].length;
      const w = word[0].toLowerCase();
      return w === "true" ? true : w === "false" ? false : null;
    }
    const start = this.i;
    while (!this.atEnd()) {
      const d = this.s[this.i];
      if (d === "," || d === "}" || d === "]" || d === "\n" || d === "\r") break;
      this.i++;
    }
    const tok = this.s.slice(start, this.i).trim();
    if (tok === "") { this.i++; return null; }
    return tok;
  }
}

/** LLM 텍스트에서 JSON을 최대한 복원해 파싱. JSON이 전혀 없으면 null. */
export function parseJsonLoose<T = any>(raw: string): T | null {
  const s = stripCodeFence(raw);
  if (!s) return null;
  const start = firstJsonStart(s);
  if (start < 0) return null;
  try {
    const v = new TolerantParser(s.slice(start)).parse();
    return v === null || v === undefined ? null : (v as T);
  } catch {
    return null;
  }
}
