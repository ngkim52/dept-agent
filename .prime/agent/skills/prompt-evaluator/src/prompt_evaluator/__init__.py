# prompt_evaluator - 프롬프트 품질 평가 매트릭스 (rule-based 0~100)
DIMS = [
    ("명확성",   ["1.", "2.", "3.", "단계", "반드시", "우선", "다음", "구체", "순서"]),
    ("트리거성", ["질문", "경우", "이면", "들어오면", "필요", "요청", "원할"]),
    ("역할/페르소나", ["당신은", "부서장", "관점", "역할", "전문", "의 전문성"]),
    ("구조화", ["# ", "##", "STEP", "→", "임계값", "판단", "기준", "절차", "항목"]),
    ("도구 연계", ["RAG", "rag_search", "websearch", "python", "조회", "검색", "데이터"]),
    ("안전/범위", ["금지", "하지 않는다", "제외", "오위임", "추측하지", "명시", "만", "범위", "한계"]),
]


def _score(text, kws):
    hits = sum(1 for k in kws if k in text)
    return min(100, hits * 20 + 15)


def grade(prompt):
    rows = []
    for title, kws in DIMS:
        rows.append({"차원": title, "점수": _score(prompt, kws)})
    overall = round(sum(r["점수"] for r in rows) / len(rows))
    return rows, overall


def run(prompt, role="", detailed=True):
    rows, overall = grade(prompt)
    out = ["## 프롬프트 품질 평가"]
    if role:
        out.append("대상: %s" % role)
    out.append("길이: %d자" % len(prompt))
    out.append("")
    for r in rows:
        bar = "█" * (r["점수"] // 10) + "▒" * (10 - r["점수"] // 10)
        out.append("%s : %3d/100 %s" % (r["차원"], r["점수"], bar))
    out.append("")
    out.append("** 전체 점수: %d/100 **" % overall)
    weak = [r["차원"] for r in rows if r["점수"] <= 45]
    if weak:
        out.append("개선 필요 차원: %s" % ", ".join(weak))
        out.append("힌트: 해당 차원 키워드를 프롬프트에 명시/강화하면 점수가 올라갑니다.")
    else:
        out.append("모든 차원 양호 — 라이브 평가 및 회귀 테스트 권장.")
    return "\n".join(out)
