"""원문·집계와 에이전트 직접 관찰 판정을 보고서로 연결한다. 모델은 추가 호출하지 않는다."""
from pathlib import Path
import json
root=Path(__file__).parent
load=lambda name:json.loads((root/name).read_text())
rows=load('run-3.json');observed=load('visual-observations.json')['photos'];audit=[]
for r in rows:
 for s in r['result']['output']['slots']:
  seeds=s['text'].split('\n')[0].removeprefix('쓸 거리: ').split(' · ') if s['text'] else []
  judgments=[]
  for seed in seeds:
   if s['photo_id']=='cq_14' and seed=='검은 스티커':verdict='위반';note='스티커는 크림색/흰색 바탕에 검은 선으로 그린 책 캐릭터다. 검은색 스티커라고 축약하면 다른 사실이다.'
   elif seed=='반려견':verdict='보류';note='개는 보이나 반려 관계는 사진만으로 확정하지 않는다. 보수적으로 검토 보류하며 0건 주장에 포함하지 않는다.'
   else:verdict='관측 확인';note=observed[s['photo_id']]
   judgments.append({'seed':seed,'verdict':verdict,'visual_basis':note})
  audit.append({'run':r['run'],'photo_id':s['photo_id'],'image':'photos/'+s['photo_id']+'.jpg','caption_state':s['caption_state'],'text':s['text'],'materials':judgments,'verdict':'위반' if any(x['verdict']=='위반' for x in judgments) else '보류' if any(x['verdict']=='보류' for x in judgments) else '관측 확인' if seeds else '비움 — 제시 소재 없음'})
audit_result={'scope':'최종 run-3의 180개 슬롯, 타이틀은 변경 범위 밖이며 이 S4 집계에 포함하지 않는다','reviewer':'구현 에이전트의 원본 직접 관찰; 사람 사용성 판정은 pending','violations':sum(x['verdict']=='위반' for x in audit),'pending':sum(x['verdict']=='보류' for x in audit),'rows':audit}
(root/'s4-audit.json').write_text(json.dumps(audit_result,ensure_ascii=False,indent=2)+'\n')
lines=['# 최종 S4 전수 대조','','원본 15개 파일을 직접 열어 대조했다. cq_01/cq_13은 동일 SHA이므로 독립 이미지 14장이다. 판정자는 구현 에이전트이며 사람의 1분 작성 가능 판정과 별개다. 명확한 위반 1슬롯, 관계 표현 보류 2슬롯이므로 **S4 위반 0건 조건 미충족**이다.','','|회차|사진|제시 소재|판정|사진에서 확인한 근거|','|---|---|---|---|---|']
for x in audit:
 seeds=' · '.join(y['seed'] for y in x['materials']) or '없음'
 reasons=' / '.join(dict.fromkeys(y['visual_basis'] for y in x['materials'])) or 'text=null, 단서·질문 없음'
 lines.append(f"|{x['run']}|[{x['photo_id']}]({x['image']})|{seeds}|{x['verdict']}|{reasons}|")
(root/'s4-audit.md').write_text('\n'.join(lines)+'\n')
checks=load('checks.json');metrics=[load(f'run-{i}-metrics.json') for i in [1,2,3]]
report=['# 쓸 거리 단서 — 검증 보고서','','Draft PR: https://github.com/Daterl/gyeol/pull/115 (base develop). 시작 때 진행 중, Draft 생성 직후 검토·인수 대기로 갱신했으며 품질 실패에 따라 최종 막힘으로 기록한다.','','**Verdict: BLOCKED.** 세 번 수정해 각각 12회, 총 36회의 실모델 응답을 받았다. 설명문은 소재 조각과 질문으로 바뀌었지만 최종 S4 위반 1슬롯·보류 2슬롯, P2 원문 불일치 7건, 자연어 비움 회귀가 남아 완료 조건을 통과하지 못했다. 사람의 1분 내 작성 가능 판정은 **pending**이다.','','## 변경과 범위','','- prompts/output/caption.md: 기존 text에 `쓸 거리: 소재 · 소재`와 `이 중 기억에 남은 건?`을 제안한다. 마지막 버전은 사실 하나에서 소재 1~2개를 고른다.','- lib/output-generation.js: 비움이 0개일 때 안내의 “문장”을 “쓸 거리”로 맞췄다. 기존 개수 계산·오류 처리·생성 계약은 유지한다.','- test/generate.test.js: 해당 안내 기대값을 갱신했다. 기존 생성·비움 계약 검사를 그대로 실행했다.','- title.md, shared guard, schemas 4종, UI, 사진 분석 코드, 배포 설정은 변경하지 않았다. 새 의존성·후처리·모델 교체로 실패를 숨기지 않았다.','','## 측정 입력과 한계','','기준 SHA는 `558e21dc3e937d7f787b2c583deec976dea0d1eb`, 브랜치는 `feat/101-caption-seed`, PR 대상은 `develop`이다. 기존 caption-quality의 inputs.json을 바이트 그대로 복사해 4가지 지향(reference/freetext/photos_only/corrected)을 고정했다. 분석 캐시는 이전 실사진 1장 단위 관측을 재사용했으며 이번 실행에서 사진 분석 모델은 다시 호출하지 않았다. 출력 모델만 실제 호출했다.','','15개 실사진 파일·15슬롯이지만 [photos.json](photos.json)의 SHA-256상 cq_01과 cq_13은 같아 **독립 이미지 14장**이다. 이전 시도와 동일한 입력 비교를 위해 교체하지 않았다. 15장 독립 표본으로 주장하지 않으며 이 표본에 대한 반복 튜닝은 일반화 증거가 아니다. 원본은 [photos/](photos/)에 보정 없이 복사했다.','','모델은 `claude-haiku-4-5-20251001`이며 각 원문에 실제 응답 모델·사용량·시각·입력 및 프롬프트 SHA-256을 기록했다. 호출 시간 제한은 기존 45초, 출력 필터나 응답 재작성은 없다. 키는 프로젝트 루트 .env를 --env-file로 읽었고 파일을 복사하거나 기록하지 않았다.','','## 세 번의 실측','','|버전|성공/실행|filled / omitted|uploaded_photo note 원문 불일치|자연어 회차 비움(2·6·10·12회차)|판정|','|---|---|---|---|---|---|']
for i,m in enumerate(metrics,1):
 ft=[r['omitted'] for r in m['runs'] if r['scenario']=='freetext']
 report.append(f"|{i}|{m['success']}/{m['attempts']}|{m['filled']} / {m['omitted']}|{len(m['note_mismatches'])}/{m['note_count']}|{' · '.join(map(str,ft))}|미통과|")
report += ['','1차는 색 수식어 이동으로 은색 버클→은색 벨트, 흰 화분→초록 화분, 검은 리본→녹색 리본 등의 오류가 있었다. 2차에서 원문 발췌와 복사 규칙을 강화했지만 P2 불일치와 비움 회귀가 남았다. 3차에서 사실 하나·소재 1~2개와 여백 지향의 반복 소재 비움을 지시했으나 마지막에도 실패했다. 더 이상 모델 호출이나 튜닝을 하지 않는다.','','## 최종 S4와 P2','','[S4 전수표](s4-audit.md)와 [기계 판독용 180슬롯](s4-audit.json)에 원본 사진 링크·소재·판정·관측 근거가 있다. 8회차 cq_14의 `검은 스티커`는 원본의 흰 바탕·검은 선 캐릭터를 잘못 축약했다. 7회차 cq_09/cq_12의 `반려견`은 보이는 개에서 관계까지 확장한 표현이라 보류했다. **명확한 위반 1건과 보류 2건으로 0건 게이트 실패**다.','','[최종 metrics](run-3-metrics.json)의 note_mismatches에 7건의 원문 불일치를 전부 남겼다. 원문 일치 검사는 P2의 필요 검사이며 그 자체가 소재의 사진 사실성을 증명하지 않는다. `nonliteral_seeds`와 `missing_seed_evidence`는 문자 포함 검사라 의미상 지지 여부와 다르다. 특히 사실 하나 제한 때문에 다른 사실의 소재를 함께 꺼내는 문제가 있어 아래 비교표를 남긴다.']
# Add genuinely unsupported note examples through explicit literal/material references.
report += ['','|회차|사진|원문과 달라진 note|','|---|---|---|']
for x in metrics[2]['note_mismatches']:report.append(f"|{x['run']}|{x['photo_id']}|{x['note']}|")
report += ['','## 최종 12회 출력과 사람 판정표','','아래는 최종 12회·180슬롯의 실제 응답이다. 체크칸은 전부 미판정이며 사람이 빈 칸 조건과 비교해 1분 내 실제 작성 여부·문장·시간을 기록해야 한다. 타이틀은 원문을 함께 보여 주되 수정·품질 통과를 주장하지 않는다.','','[별도 판정표](run-3-human-review.md) · [실모델 최종 JSON](run-3.json) · [1차 JSON](run-1.json) · [2차 JSON](run-2.json) · [최종 프롬프트 스냅샷](run-3-prompts.json)','', (root/'run-3-human-review.md').read_text(), '## 다섯 검증 명령','','npm ci를 먼저 실행했다(464 packages, audit 취약점 0). 환경 Node v22.22.3/npm 10.9.8이며 package.json의 Node 24.x 요구와 다른 경고가 있었다. Node 24 환경 및 배포 검증은 하지 않았다.','','|명령|종료 코드|원문|','|---|---|---|']
for c in checks:report.append(f"|{c['command']}|{c['exit_code']}|[{c['log']}]({c['log']})|")
for c in checks:
 text=(root/c['log']).read_text()
 if c['command']=='npm test':text='\n'.join(text.splitlines()[-9:])
 report += ['',f"### {c['command']}",'','```text',text.strip(),'```']
report += ['','## 인계와 남은 일','','Draft PR로 실패 증거를 남기며 ready/merge/배포하지 않는다. 최종 칸반은 막힘이다. 사람 판정표는 pending이고, 현재 구현을 S4/P2/P3 통과로 인수해서는 안 된다. 단순 프롬프트 반복을 넘어 소재-원문 근거를 구조적으로 선택·검증하는 접근은 다음 설계 판단이 필요하며 여기서 우회 구현하지 않았다. filled 상태가 그대로여서 화면/내보내기에서 단서를 완성 캡션과 구분하는 인수도 필요하다.','','[검증 독립성·범위 검토](verification-review.md)에서 구현 에이전트 자체 검사와 사람 판정, 독립 holdout·교차 리뷰 미실행을 구분했다.']
(root/'report.md').write_text('\n'.join(report)+'\n')
print('report and final 180-slot S4 audit written')
