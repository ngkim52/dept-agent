// 파이썬 데이터 처리 실행기 — pandas/openpyxl 기반 엑셀·CSV/업로드 파일 분석
// 파이썬 코드 + 입력 데이터/업로드 파일 경로를 받아 격리 실행
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { writeFile, mkdtemp, rm } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface PyExecInput {
  /** 파이썬 코드 (pandas/openpyxl 사용 가능, df 변수 제공) */
  script: string;
  /** 분석할 데이터 문자열 (업로드 파일이 없을 때 사용) */
  inputData?: string;
  /** 업로드 파일 경로 (있다면 df를 이 파일에서 로드 — xlsx/csv 지원) */
  filePath?: string;
}

export interface PyExecResult {
  ok: boolean;
  stdout: string;
  stderr?: string;
}

const PYTHON =
  process.env.PYTHON_BIN ?? "/home/ngkim52/.local/share/dept-agent-py/bin/python";
const TIMEOUT_MS = 20000;
const MAX_OUTPUT = 40_000;

// 파이썬 prelude — 'df', 'input_data', 'file_path' 변수를 제공
function buildPrelude(dataPath: string, filePath?: string): string {
  const dp = JSON.stringify(dataPath);
  const fp = filePath ? JSON.stringify(filePath) : '""';
  return `import sys, io, json
import pandas as pd
from pathlib import Path

file_path = ${fp}
if file_path:
    p = Path(file_path)
    if p.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(p)
        input_data = ""
    else:
        try:
            df = pd.read_csv(p, sep=None, engine="python")
            input_data = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            input_data = p.read_text(encoding="utf-8", errors="replace")
            df = pd.DataFrame({"row": input_data.splitlines()})
else:
    _data = Path(${dp})
    input_data = _data.read_text(encoding="utf-8", errors="replace") if _data.exists() else ""
    try:
        df = pd.read_csv(io.StringIO(input_data), sep=None, engine="python")
    except Exception:
        df = pd.DataFrame({"row": input_data.splitlines()})

`;
}

export async function execPython({
  script,
  inputData = "",
  filePath,
}: PyExecInput): Promise<PyExecResult> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dept-py-"));
  const dataPath = path.join(dir, "input.txt");
  const scriptPath = path.join(dir, "script.py");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(dir, { recursive: true }));
  await writeFile(dataPath, inputData.slice(0, 200_000), "utf8");
  await writeFile(scriptPath, buildPrelude(dataPath, filePath) + "\n" + script, "utf8");

  try {
    // 보안: 자식 프로세스에 민감 키(LLM/RAGFlow/Serper 등)를 절대 상속하지 않는다.
    // 허용 항목은 파이썬 실행에 필요한 최소 env만. 그 외(cwd·업로드 데이터)는 temp 파일로 제한.
    const NODE_ENV: "development" | "production" | "test" =
      process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" ? process.env.NODE_ENV : "production";
    const minimalEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? "/usr/bin",
      HOME: process.env.HOME ?? `/tmp`,
      TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
      LANG: process.env.LANG ?? "C.UTF-8",
      PYTHONIOENCODING: "utf-8",
      PYTHONPATH: "",
      NODE_ENV,
    };
    const { stdout, stderr } = await execFileAsync(PYTHON, [scriptPath], {
      timeout: TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: minimalEnv,
    });
    return {
      ok: true,
      stdout: (stdout || "").slice(0, MAX_OUTPUT),
      stderr: stderr ? stderr.slice(0, 2000) : undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      stdout: String(e?.stdout ?? "").slice(0, MAX_OUTPUT),
      stderr: String(e?.message ?? e).slice(0, 3000),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
