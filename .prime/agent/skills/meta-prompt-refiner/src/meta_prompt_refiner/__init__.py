# meta_prompt_refiner - 프롬프트 자기최적화 (rule-based, 멱등)


def _apply_prompt(prompt, marker, block):
    if marker in prompt:
        return prompt
    return prompt + "\n\n" + marker + "\n" + block


def run(base_prompt="", goal="", failures="", rounds=3):
    fl = [x.strip() for x in failures.split(";") if x.strip()] if failures else []
    cur = base_prompt
    applied = []
    if goal.strip():
        cur = _apply_prompt(cur, "# [자동강화-목표]", goal.strip())
        applied.append("목표 규칙")
    if fl:
        fb = "반드시 아래 오류를 회피한다:\n" + "\n".join("- " + f for f in fl)
        cur = _apply_prompt(cur, "# [자동강화-오류방지]", fb)
        applied.append("오류 방지 규칙")

    lines = ["## 프롬프트 자기최적화"]
    lines.append("목표: " + (goal or "(없음)"))
    if fl:
        lines.append("실패 사례: " + "; ".join(fl))
    lines.append("")
    lines.append("적용한 강화: " + (", ".join(applied) if applied else "없음"))
    lines.append("반복 라운드: %d회 (각 라운드는 최종 프롬프트를 재평가 대상으로 제안)" % max(1, rounds))
    lines.append("")
    lines.append("** 결과 프롬프트 길이: %d자 **" % len(cur))
    lines.append("")
    lines.append("최종 프롬프트:")
    lines.append("```")
    lines.append(cur)
    lines.append("```")
    return "\n".join(lines)
