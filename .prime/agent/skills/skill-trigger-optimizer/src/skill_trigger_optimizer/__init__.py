# skill_trigger_optimizer - Skill trigger diagnosis and optimization
from dataclasses import dataclass


@dataclass
class SkillSpec:
    name: str = ''
    description: str = ''
    body: str = ''


WHEN_WORDS = ['할 때', '때 사용', '경우', '이면', '다면', '질문', '필요', '요청',
              '원할', '확인할 때', '검토할 때']
WHAT_WORDS = ['검토', '분석', '생성', '작성', '점검', '판단', '진단', '추천',
              '확인', '모니터링', '관리', '제시', '검증', '이끌', '정리']
SCOPE_WORDS = ['만', '아닌', '제외', '사용하지', '아님', '범위', '스코프', '외의']


def check_when(desc):
    return [w for w in WHEN_WORDS if w in desc]


def check_what(desc):
    return [w for w in WHAT_WORDS if w in desc]


def check_scope(desc):
    return [w for w in SCOPE_WORDS if w in desc]


def _sig(ok):
    return 'PASS' if ok else 'FAIL'


def _grade(desc):
    when = check_when(desc)
    what = check_what(desc)
    scope = check_scope(desc)
    n = len(desc)
    return [
        {'title': 'when 트리거', 'ok': bool(when), 'sig': _sig(bool(when)),
         'evi': ', '.join(when) if when else '설명에 when 키워드 없음'},
        {'title': 'what 수행', 'ok': bool(what), 'sig': _sig(bool(what)),
         'evi': ', '.join(what) if what else '수행 동사 없음'},
        {'title': 'scope 배제', 'ok': bool(scope), 'sig': 'PASS' if scope else 'WARN',
         'evi': ', '.join(scope) if scope else '발동 범위 배제 없음(오발동 위험)'},
        {'title': '길이', 'ok': 15 <= n <= 300, 'sig': 'PASS' if 20 <= n <= 200 else 'WARN',
         'evi': '%d자 (권장 20~200)' % n},
    ]


def _suggestion(desc):
    parts = []
    if not check_when(desc):
        parts.append("'언제' 트리거 추가 (예: '~ 질문이 들어오면', '~ 검토가 필요할 때')")
    if not check_what(desc):
        parts.append("'무엇을 하는지' 수행 동사 추가 (검토/분석/생성 등)")
    if not check_scope(desc):
        parts.append("발동 범위 배제 문구 추가 (타 스킬과 겹침 방지)")
    if not (20 <= len(desc) <= 200):
        parts.append("설명 길이를 20~200자로 조정")
    return ' ; '.join(parts) if parts else '설명 충분 - 본문·라이브 발동 재확인 권장'


def run(skills_text, detailed=True):
    """여러 스킬을 받아 발동 진단 리포트를 반환.
    입력 형식:
      SKILL: <name>
      description: <desc>
      body: <첫줄>
    """
    specs = _parse(skills_text)
    if not specs:
        return '진단할 스킬이 없습니다. SKILL:/description:/body: 블록으로 입력하세요.'
    out = ['## 스킬 발동(trigger) 진단']
    for s in specs:
        g = _grade(s.description)
        worst = 'FAIL' if any(x['sig'] == 'FAIL' for x in g) else ('WARN' if any(x['sig'] == 'WARN' for x in g) else 'PASS')
        out.append('\n### %s — 상태: %s' % (s.name, worst))
        for x in g:
            out.append('- [%s] %s: %s' % (x['sig'], x['title'], x['evi']))
        if worst != 'PASS' and detailed:
            out.append('  → 개선 제안: %s' % _suggestion(s.description))
    return '\n'.join(out)


def _parse(text):
    out, cur = [], None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.lower().startswith('skill:'):
            if cur:
                out.append(cur)
            cur = SkillSpec(name=line.split(':', 1)[1].strip())
        elif cur is not None:
            if line.lower().startswith('desc'):
                cur.description = line.split(':', 1)[1].strip()
            elif line.lower().startswith('body') or line.startswith('본문'):
                cur.body = line.split(':', 1)[1].strip()
    if cur:
        out.append(cur)
    return [s for s in out if s.name]
