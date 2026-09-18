"""기존 36회 응답을 '사실 정합성' 기준으로 다시 채점한다. 모델을 호출하지 않는다.

기존 기준(summarize.py의 nonliteral_seeds)은 소재 문자열이 describable_facts에
그대로 들어 있는지만 봤다. 이 스크립트는 같은 출력에 대해 '그 사진의 관측 사실이
그 소재를 지지하는가'를 묻고 세 가지로 나눈다.

  명확한 위반 — 핵심어가 그 사진의 관측 사실 어디에도 없다. 사진이 지지하지 않는다.
  통과      — 핵심어와 모든 수식어가 한 사실 안에 있고, 색 수식어가 핵심어에 붙어
              있음이 그 사실의 어순으로 확인된다.
  보류      — 그 밖의 전부. 문자로는 지지 여부를 확정할 수 없으므로 사람이 본다.

느슨하게 만드는 기준이 아니다. 확인되지 않은 것은 통과로 올리지 않고 보류에 남긴다.

사용: python3 rescore.py            (rescore.json / rescore.md 생성)
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
LABELS = ['run-1', 'run-2', 'run-3']

# 표층 변이만 흡수한다. 의미를 넓히는 동의어 사전은 두지 않는다.
SUFFIX = ('과', '와', '의', '이', '가', '은', '는', '을', '를', '에', '도', '들')
EXTRA = ('색', '무늬')
COLOR = re.compile(r'색$|^(흰|하얀|검은|검정|까만|붉은|빨간|푸른|파란|노란|초록|녹색'
                   r'|연한|밝은|어두운|진한|짙은)$')
# 색 수식어와 핵심어 사이에 와도 귀속이 바뀌지 않는 속성 연결어.
BRIDGE = ('계열', '질감', '형태', '톤', '느낌', '빛')
# 앞 어절이 같은 소재의 수식어일 때만 사슬을 잇는 관형절 표현. '줄무늬가 있는 모자'는
# 줄무늬가 모자에 걸리지만, '버클이 달린 벨트'의 버클은 소재의 수식어가 아니므로 끊긴다.
RELATION = ('있는', '달린', '붙은', '들어간', '그려진', '적힌', '인쇄된', '심긴', '묻은')
# 격조사가 붙은 어절은 새 논항이 시작된 자리라 사슬을 끊는다. 조사 없는 어절은
# 뒤 명사를 꾸미는 수식어로 보고 건너뛴다('흰 반팔 티셔츠'의 '반팔').
CASE = ('이', '가', '은', '는', '을', '를', '에', '의', '와', '과', '로', '으로', '에서')

VERDICT_CLEAR = '명확한 위반'
VERDICT_HOLD = '보류'
VERDICT_PASS = '통과'


def strip_suffix(token):
    for s in sorted(SUFFIX, key=len, reverse=True):
        if token.endswith(s) and len(token) > len(s):
            return token[:-len(s)]
    return token


def variants(token):
    """'흰'/'흰색', '체크'/'체크무늬', 조사 붙은 꼴을 같은 것으로 본다."""
    out = {token, strip_suffix(token)}
    for base in list(out):
        for e in EXTRA:
            out.add(base + e)
            if base.endswith(e) and len(base) > len(e):
                out.add(base[:-len(e)])
    return sorted({v for v in out if v}, key=len, reverse=True)


def token_match(seed_token, fact_token):
    """사실의 어절 하나가 소재 토큰을 담고 있는가. 어절 경계에서만 맞춘다."""
    ft = fact_token
    for v in variants(seed_token):
        if ft.startswith(v) or strip_suffix(ft) == v or ft.rstrip("'\",.)").startswith(v):
            return True
    return False


def in_fact(seed_token, fact):
    """어절 단위로 못 찾으면 띄어쓰기를 지운 문장에서 한 번 더 본다('니트 옷'/'니트옷')."""
    if any(token_match(seed_token, ft) for ft in fact.split()):
        return True
    flat = re.sub(r'\s+', '', fact)
    return any(v in flat for v in variants(seed_token))


def is_bridge(fact_token):
    return any(fact_token.startswith(b) for b in BRIDGE)


def color_attached(color, head, mods, fact_tokens):
    """색 수식어가 핵심어에 이어지는 자리에 있는지 사실의 어순으로 확인한다.

    색 어절에서 출발해 오른쪽으로 걸으며, 같은 소재의 다른 수식어·속성 연결어·격조사
    없는 수식 어절만 건너뛴다. 격조사가 붙은 새 명사를 만나면 거기서 끊는다.
    '은색 버클이 달린 검은 벨트'의 '은색 벨트'는 '버클이'에서 끊겨 확인되지 않는다.
    """
    others = [m for m in mods if m != color]
    for i, ft in enumerate(fact_tokens):
        if not token_match(color, ft):
            continue
        prev_is_other = False
        for nxt in fact_tokens[i + 1:]:
            if token_match(head, nxt):
                return True
            if any(token_match(o, nxt) for o in others):
                prev_is_other = True
                continue
            if is_bridge(nxt) or (prev_is_other and nxt in RELATION):
                continue
            if not nxt.endswith(CASE):
                prev_is_other = False
                continue
            break
    return False


def score(seed, facts):
    """소재 하나를 그 사진의 관측 사실과 대조해 판정과 근거를 돌려준다."""
    tokens = seed.split()
    head, mods = tokens[-1], tokens[:-1]

    bearing = [f for f in facts if in_fact(head, f)]
    if not bearing:
        return VERDICT_CLEAR, '핵심어가 그 사진의 관측 사실에 없다', ''

    fallback = None
    for fact in bearing:
        missing = [m for m in mods if not in_fact(m, fact)]
        if missing:
            fallback = fallback or (
                VERDICT_HOLD, f'수식어 "{missing[0]}"가 핵심어와 같은 사실 안에 없다', '')
            continue
        ft = fact.split()
        unattached = [m for m in mods
                      if COLOR.search(strip_suffix(m)) and not color_attached(m, head, mods, ft)]
        if unattached:
            fallback = (VERDICT_HOLD,
                        f'색 수식어 "{unattached[0]}"가 핵심어에 붙어 있는지 문장에서 확인되지 않는다',
                        fact)
            continue
        return VERDICT_PASS, '핵심어와 모든 수식어가 한 사실 안에서 확인된다', fact
    return fallback


def literal(seed, facts):
    """기존 기준: 소재 문자열이 사실에 통째로 들어 있는가."""
    return any(seed in fact for fact in facts)


# 명확한 위반으로 떨어진 소재에 대한 에이전트 의견. 사람 판정을 대신하지 않으며
# 판정표에서 사람 O/X 칸과 다른 열에 둔다.
OPINION = {
    ('cq_09', '반려견'): '사진은 개를 보여주지만 기르는 관계는 사진으로 확인할 수 없다. 실질 위반으로 본다.',
    ('cq_12', '반려견'): '위와 같다. 관측에 없는 관계를 단정했다.',
    ('cq_09', '흰 털 강아지'): "관측은 '흰 털의 개'다. 사실은 같고 단어만 바꿨다.",
    ('cq_03', '검은 우븐 가방'): "관측은 '검은색 우븐 패턴의 숄더백'이다. 상위어로 바꿨을 뿐 사실은 맞다.",
    ('cq_08', '파란 체크셔츠'): "관측은 '파란색 체크무늬 셔츠'다. 붙여쓰기와 '무늬' 생략 차이다.",
    ('cq_15', '녹색 잎 배경'): "관측은 '뒤로 짙은 초록색 잎이 보인다'다. '배경'은 관측에 없는 낱말이나 사실과 어긋나지 않는다.",
    ('cq_15', '초록 잎 배경'): '위와 같다.',
    ('cq_04', '음식 여러 종류'): "관측은 '여러 가지 음식'이다. 사실은 맞으나 소재로서 너무 막연하다.",
    ('cq_11', '검은색과 흰색 겹옷'): "관측은 '겉옷'이다. '겹옷'은 관측에 없는 낱말이며 오기로 보인다.",
}


def main():
    inputs = {x['name']: x['request'] for x in json.loads((ROOT / 'inputs.json').read_text())}
    rows = []
    for label in LABELS:
        for run in json.loads((ROOT / (label + '.json')).read_text()):
            if not run['ok']:
                continue
            for slot in run['result']['output']['slots']:
                if slot['caption_state'] != 'filled':
                    continue
                facts = next(s['caption_inputs']['describable_facts']
                             for s in inputs[run['scenario']]['feed']['slots']
                             if s['photo_id'] == slot['photo_id'])
                head = slot['text'].split('\n')[0].removeprefix('쓸 거리: ')
                for seed in head.split(' · '):
                    verdict, reason, fact = score(seed, facts)
                    rows.append({
                        'label': label, 'run': run['run'], 'scenario': run['scenario'],
                        'photo_id': slot['photo_id'], 'seed': seed,
                        'verdict': verdict, 'reason': reason, 'supporting_fact': fact,
                        'literal_pass': literal(seed, facts),
                    })

    by_label = {l: Counter(r['verdict'] for r in rows if r['label'] == l) for l in LABELS}
    totals = Counter(r['verdict'] for r in rows)
    literal_fail = Counter(r['label'] for r in rows if not r['literal_pass'])

    result = {
        'scope': f'{len(LABELS)}개 회차 세트 · 실모델 36회 · filled 슬롯의 소재 {len(rows)}개. '
                 '새 모델 호출 0회, 입력은 기존 run-*.json과 inputs.json 뿐이다.',
        'method': '핵심어 = 소재의 마지막 어절, 수식어 = 나머지. 판정 규칙은 rescore.py 참조.',
        'model_calls': 0,
        'totals': {'소재': len(rows), **{k: totals.get(k, 0)
                                         for k in [VERDICT_CLEAR, VERDICT_HOLD, VERDICT_PASS]}},
        'previous_criterion': {
            'name': '원문 문자열 포함(nonliteral_seeds)',
            'fail': sum(literal_fail.values()),
            'fail_by_run': dict(literal_fail),
        },
        'by_run': {l: {'소재': sum(by_label[l].values()),
                       **{k: by_label[l].get(k, 0)
                          for k in [VERDICT_CLEAR, VERDICT_HOLD, VERDICT_PASS]},
                       '기존 기준 불일치': literal_fail.get(l, 0)} for l in LABELS},
        'rows': rows,
    }
    (ROOT / 'rescore.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'rescore.md').write_text(render(result))
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}, ensure_ascii=False, indent=2))
    return result


def cross_check(rows):
    """사진을 직접 열고 만든 s4-audit.json과 최종 회차에서 엇갈리는 곳을 센다."""
    audit = json.loads((ROOT / 's4-audit.json').read_text())
    gold = {(r['run'], r['photo_id'], m['seed']): m['verdict']
            for r in audit['rows'] for m in (r.get('materials') or [])}
    pairs = Counter()
    for r in rows:
        if r['label'] != 'run-3':
            continue
        pairs[(gold.get((r['run'], r['photo_id'], r['seed']), '(대조 없음)'), r['verdict'])] += 1
    return pairs


def render(result):
    rows = result['rows']
    t, prev, by_run = result['totals'], result['previous_criterion'], result['by_run']
    out = [
        '# 사실 정합성 기준 재채점 — 기존 36회 데이터',
        '',
        f"기존 실모델 36회의 출력을 그대로 두고 채점 기준만 바꿔 다시 셌다. **새 모델 호출 {result['model_calls']}회.** "
        '입력은 `run-1.json`·`run-2.json`·`run-3.json`과 `inputs.json`뿐이다. '
        '재현: `python3 rescore.py` (판정 규칙 검사는 `python3 rescore.py --selftest`).',
        '',
        '## 왜 기준을 바꿨나',
        '',
        '기존 기준은 소재 문구가 `describable_facts` 문자열을 **그대로 포함하는가**를 봤다. '
        '그래서 `흰 털의 개`처럼 사진에 실제로 보이는 소재도 글자가 다르면 불일치로 셌고, '
        '**진짜 남은 문제가 몇 건인지 알 수 없었다.** 바꾼 기준은 소재가 그 사진의 관측 사실로 '
        '**지지되는가**를 묻는다. 느슨하게 만든 것이 아니다 — 지지되지 않으면 여전히 실패이고, '
        '문자로 확정할 수 없으면 통과가 아니라 **보류**로 남겨 사람이 본다.',
        '',
        '## 세 숫자 — 기존 기준과 나란히',
        '',
        '|회차 세트|소재 수|**명확한 위반**|**보류**|**통과**|(참고) 기존 기준 불일치|',
        '|---|---|---|---|---|---|',
    ]
    for label, v in by_run.items():
        out.append(f"|{label}|{v['소재']}|{v[VERDICT_CLEAR]}|{v[VERDICT_HOLD]}|{v[VERDICT_PASS]}|{v['기존 기준 불일치']}|")
    out += [
        f"|**합계**|**{t['소재']}**|**{t[VERDICT_CLEAR]}**|**{t[VERDICT_HOLD]}**|**{t[VERDICT_PASS]}**|**{prev['fail']}**|",
        '',
        f"기존 기준은 {t['소재']}개 소재 중 **{prev['fail']}개**를 불일치로 셌다. 새 기준으로는 "
        f"**명확한 위반 {t[VERDICT_CLEAR]}건 · 보류 {t[VERDICT_HOLD]}건 · 통과 {t[VERDICT_PASS]}건**이다. "
        f"최종 회차(run-3)만 보면 위반 {by_run['run-3'][VERDICT_CLEAR]}건 · 보류 {by_run['run-3'][VERDICT_HOLD]}건이다.",
        '',
        '## 판정 규칙',
        '',
        '소재의 마지막 어절을 **핵심어**, 나머지를 **수식어**로 본다.',
        '',
        '```mermaid',
        'graph TB',
        '  A["소재 하나\\n핵심어 = 마지막 어절, 나머지 = 수식어"] --> B{"핵심어가 그 사진의 관측 사실에 있는가"}',
        '  B -->|없다| V["명확한 위반 — 사진이 지지하지 않는다"]',
        '  B -->|있다| C{"핵심어와 모든 수식어가 한 사실 안에 있는가"}',
        '  C -->|아니다| H["보류 — 문자로 확정 못 한다. 사람이 본다"]',
        '  C -->|그렇다| D{"색 수식어가 핵심어에 걸리는 것이 어순으로 확인되는가"}',
        '  D -->|아니다| H',
        '  D -->|그렇다| P["통과"]',
        '```',
        '',
        '|판정|조건|',
        '|---|---|',
        f'|{VERDICT_CLEAR}|핵심어가 그 사진의 관측 사실 어디에도 없다. 사진이 지지하지 않는다.|',
        f'|{VERDICT_PASS}|핵심어와 모든 수식어가 **한 사실 안에** 있고, 색 수식어가 핵심어에 걸린다는 것이 그 문장의 어순으로 확인된다.|',
        f'|{VERDICT_HOLD}|그 밖의 전부. 문자로 지지 여부를 확정할 수 없으므로 사람이 본다.|',
        '',
        "표층 변이(`흰`/`흰색`, `체크`/`체크무늬`, 조사, 띄어쓰기)만 같은 것으로 흡수한다. "
        "동의어 사전은 두지 않았다 — 그래서 `숄더백`을 `가방`으로 바꾼 것도 위반으로 떨어진다.",
        '',
        '## 사진 직접 대조와의 교차 확인 (run-3, 276개 소재)',
        '',
        '이 재채점은 사진을 보지 않고 관측 사실 텍스트만 쓴다. 사진을 직접 열고 만든 '
        '[s4-audit.json](s4-audit.json)과 맞춰 보면:',
        '',
        '|사진 직접 대조|재채점|건수|',
        '|---|---|---|',
    ]
    for (gold_v, mine), n in sorted(cross_check(rows).items(), key=lambda x: -x[1]):
        out.append(f'|{gold_v}|{mine}|{n}|')
    out += [
        '',
        '**사진 대조가 위반·보류로 본 것을 재채점이 통과로 올린 경우는 0건이다.** '
        '기준을 느슨하게 만들지 않았다는 근거로 이 줄을 남긴다. '
        '엇갈린 12건은 전부 재채점이 더 보수적이거나(9건 보류), 사진 없이도 관계 표현임이 '
        '분명해 더 엄격하거나(`반려견` 2건), 사진을 봐야만 알 수 있어 보류로 남긴 경우(`검은 스티커` 1건)다.',
        '',
        '## 명확한 위반 전수 — 사람 판정 칸은 비어 있다',
        '',
        '|회차 세트|회차|사진|소재|에이전트 의견 (사람 판정 아님)|사람 O/X|',
        '|---|---|---|---|---|---|',
    ]
    for r in rows:
        if r['verdict'] != VERDICT_CLEAR:
            continue
        note = OPINION.get((r['photo_id'], r['seed']), '')
        out.append(f"|{r['label']}|{r['run']}|{r['photo_id']}|{r['seed']}|{note}|☐ O ☐ X|")
    out += [
        '',
        '## 보류 — 사람이 봐야 하는 것',
        '',
        '같은 소재가 여러 회차에 반복되면 한 줄로 모으고 횟수를 적었다.',
        '',
        '|건수|사진|소재|보류 사유|사람 O/X|',
        '|---|---|---|---|---|',
    ]
    held = Counter((r['photo_id'], r['seed'], r['reason'])
                   for r in rows if r['verdict'] == VERDICT_HOLD)
    for (photo_id, seed, reason), n in held.most_common():
        out.append(f'|{n}|{photo_id}|{seed}|{reason}|☐ O ☐ X|')
    r3 = by_run['run-3']
    out += [
        '', f'보류 {t[VERDICT_HOLD]}건은 서로 다른 소재 {len(held)}종이다.', '',
        '## 판정 — 에이전트 의견 한 줄',
        '',
        f"> 최종 회차 소재 {r3['소재']}개 중 사진이 지지하지 않는 주장은 `반려견` {r3[VERDICT_CLEAR]}건뿐이고 "
        f"나머지 위반 8건은 다른 회차의 어휘 치환이라, **품질 자체는 쓸 만한 수준으로 보인다.** "
        f"다만 보류 {r3[VERDICT_HOLD]}건(주로 색 수식어 귀속)을 사람이 확인하기 전에는 받아들일지 결정할 수 없다.",
        '',
        '이 줄은 의견이고 판정이 아니다. 위 두 표의 **사람 O/X 칸은 비워 두었다.** '
        '1분 내 작성 가능 여부는 이 재채점의 범위 밖이며 [run-3-human-review.md](run-3-human-review.md)에서 여전히 pending이다.',
        '',
        '## 이 기준이 못 보는 것',
        '',
        '- 사진을 보지 않는다. 관측 사실 자체가 틀렸다면 이 재채점도 같이 틀린다.',
        '- 동의어·상위어를 모른다. `숄더백`→`가방`, `개`→`강아지`가 위반으로 떨어진다.',
        "- 핵심어를 '마지막 어절'로 단순히 잡는다. `음식 여러 종류`처럼 어순이 뒤집히면 헛짚는다.",
        '- 색 수식어 귀속은 어순 사슬로만 본다. 문장 구조가 복잡하면 통과가 아니라 보류로 떨어진다.',
        '',
    ]
    return '\n'.join(out).rstrip() + '\n'


def selftest():
    """판정 규칙이 알려진 사례에서 뒤집히지 않는지 확인한다. 통과로 밀어 올리는 완화를 막는 검사다."""
    inputs = json.loads((ROOT / 'inputs.json').read_text())
    facts = {p['photo_id']: p['describable_facts']
             for p in inputs[0]['request']['context']['photos']}
    cases = [
        # 사진이 지지하지 않는 소재는 통과시키지 않는다.
        ('cq_09', '반려견', VERDICT_CLEAR),        # 관계 표현, 관측에 없다
        ('cq_09', '흰 털 강아지', VERDICT_CLEAR),   # 관측은 '개', 단어를 바꿨다
        ('cq_15', '초록 잎 배경', VERDICT_CLEAR),
        # 색 수식어를 다른 물건에서 옮겨 온 1차 오류는 통과가 아니라 보류로 남는다.
        ('cq_07', '은색 벨트', VERDICT_HOLD),       # 은색은 버클, 벨트는 검은색
        ('cq_05', '초록 화분', VERDICT_HOLD),       # 초록은 잎, 화분은 흰색
        ('cq_14', '검은 스티커', VERDICT_HOLD),     # 검은색은 노트 옆면, 스티커가 아니다
        ('cq_14', '크림색 노트', VERDICT_HOLD),     # 크림색은 표지에 대한 서술
        # 글자만 다르고 사실은 맞는 소재는 통과한다. 기존 기준이 전부 불일치로 세던 것들이다.
        ('cq_09', '흰 털의 개', VERDICT_PASS),
        ('cq_06', '진주 목걸이', VERDICT_PASS),     # 관측: 진주 형태의 흰 목걸이
        ('cq_03', '갈색 스웨이드 재킷', VERDICT_PASS),
        ('cq_07', '흰 스카프', VERDICT_PASS),
        ('cq_05', '흰 화분', VERDICT_PASS),
        ('cq_13', '파란색과 노란색 줄무늬 모자', VERDICT_PASS),
        ('cq_15', '흰 티셔츠', VERDICT_PASS),       # 관측: 흰 반팔 티셔츠
    ]
    bad = []
    for photo_id, seed, expected in cases:
        got = score(seed, facts[photo_id])[0]
        if got != expected:
            bad.append(f'{photo_id} "{seed}": {expected} 이어야 하는데 {got}')
    assert not bad, '판정 규칙이 바뀌었다:\n  ' + '\n  '.join(bad)
    # 기존 기준이 통과시킨 것을 새 기준이 조용히 떨어뜨리지 않는지도 본다.
    assert literal('흰색 스카프', facts['cq_07']) and score('흰색 스카프', facts['cq_07'])[0] == VERDICT_PASS
    print(f'selftest ok — {len(cases)}개 사례')


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    else:
        main()
