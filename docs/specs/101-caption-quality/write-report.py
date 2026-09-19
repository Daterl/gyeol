import json,pathlib
root=pathlib.Path(__file__).parent
read=lambda name:json.loads((root/name).read_text())
phases={p:read(p+'.json') for p in ['before','after']}
# 전수 출력과 사진을 읽은 에이전트의 판정. 정규식의 판정 결과가 아니다.
accepted={2:['cq_14','cq_04'],3:['cq_03','cq_08'],7:['cq_03'],12:['cq_14','cq_13','cq_12','cq_03','cq_09','cq_07','cq_05','cq_08','cq_10','cq_02','cq_01']}
findings={
 ('before',1,'cq_08'):'흰색 안쪽 상의를 하늘색으로 바꿨다.',
 ('before',2,'cq_04'):'입력과 사진에 없는 분홍색 신발을 추가했다.',
 ('before',4,'cq_15'):'흰 티 위 녹색 민소매의 겹침을 반대로 썼다.',
 ('before',6,'cq_03'):'재킷 안 리본 상의를 재킷 위로 뒤집었다.',
 ('before',8,'cq_06'):'반지는 해당 슬롯 describable_facts에 없다.',
 ('before',8,'cq_14'):'분홍 라벨을 흰 라벨로 바꿨다.',
 ('after',4,'cq_03'):'재킷 안 리본 상의를 재킷 위로 뒤집었다.',
 ('after',5,'cq_10'):'여러 손가락의 반지를 손가락마다 있다고 확장했다.',
 ('after',12,'cq_06'):'무릎 앞 핸드백을 소파 위로 옮겨 표현했다. 위치 모호성으로 보수적 탈락.',
}
judgments=[]
for phase,runs in phases.items():
 for r in runs:
  if not r['ok']:continue
  for s in r['result']['output']['slots']:
   flag=findings.get((phase,r['run'],s['photo_id']))
   if s['caption_state']=='omitted': label='비움';reason='게시 문장이 없으므로 캡션 통과에 가산하지 않는다.'
   elif flag:label='설명문 또는 사실 오류';reason=flag
   elif phase=='after' and s['photo_id'] in accepted.get(r['run'],[]):label='캡션 초안';reason='사물·차림의 핵심만 남아 사진과 함께 게시할 구절로 편집 가능하다고 에이전트가 판정했다.'
   else:label='설명문';reason='화면 배치·인물의 자세나 여러 사물을 관찰 보고처럼 서술해 게시 초안으로는 다시 써야 한다고 판정했다.'
   judgments.append({'phase':phase,'run':r['run'],'photo_id':s['photo_id'],'text':s['text'],'verdict':label,'reason':reason,'fact_issue':flag,'human_verdict':None})
(root/'judgments.json').write_text(json.dumps({'reviewer':'Codex 에이전트(작성자, 비블라인드)','human_review':'pending','rubric':'사진 설명을 다시 쓸 필요 없이 포인트 한두 개를 남긴 게시 구절이면 통과. 비움과 생성 실패는 통과에 가산하지 않는다. 사실 오류는 탈락. 문장의 길이만으로 판정하지 않는다.','rows':judgments},ensure_ascii=False,indent=2)+'\n')
m=read('metrics.json'); checks=read('checks.json')
md='''# 캡션 품질 수정 실측 보고서

**상태: 막힘. 세 번의 프롬프트 수정으로는 품질 완료 조건을 충족하지 못했다. Draft 후보이며 merge 대상이 아니다.**

기존 설명문을 짧게 만드는 효과는 있었지만 마지막 버전에도 사실 뒤집힘과 부정확한 note가 남았다. 통과 숫자를 만들려고 후처리로 문장을 교체하거나 실패 회차를 삭제하지 않았다. 사람의 게시 가능 판정은 미실행이다.

## 변경과 범위

- `prompts/output/caption.md`: 인스타 게시 목적, 사실 하나 선택, 짧은 구절, 광고 인용 금지, 원문 note와 기존 계약을 명시했다.
- `prompts/output/title.md`: 사진 속 광고·계절·숫자·브랜드를 전체 묶음의 사실로 확대하지 않도록 했다.
- 제품 함수·화면·공통 style_guard·schemas/·모델 설정·배포 설정은 변경하지 않았다.
- rationale 유출 작업의 입력 투영과 공통 규칙 변경은 포함하지 않았다. 그 브랜치의 미커밋 diff를 읽었으며 caption.md의 note 문단이 통합 접점이다.

## 재현 조건

기준선 커밋 b152c45. 원격에 audit/product-quality 브랜치가 없어 로컬 audit/product-quality 2e7a700의 a3_analyses.json을 읽었다. 감사에서 성공한 14장 분석을 재사용하고 실패했던 과자 사진 한 장만 analyzePhoto로 단일 호출하여 복구했다. 원본 사진 15장을 직접 열어 대조했다. 반복 이미지 cq_01/cq_13도 원래 15장 구성을 그대로 보존했다.

사진은 pivot/apify-check/fixtures/images/에서 읽기만 했다. 현재 입력에는 감사 분석에서 넘어온 하늘색/청록색 같은 색 명명의 모호함이 있어, 모델이 사실 배열을 지키는지와 원사진의 완전한 정확성은 같은 주장이 아니다. 사진 분석 전체를 다시 평가한 결과로 해석하지 않는다.

`inputs.json`에 reference·freetext·photos_only·corrected의 요청 전문을 고정했다. reference는 현재 준비된 29cm 계정 스냅샷이다. 네 조건을 1,2,3,4,1,2,3,4,1,2,1,2 순으로 실행했다. 각 전후 회차의 입력 SHA-256은 같다. 서버 generateOutput 그대로 호출했고 모델은 claude-haiku-4-5-20251001, 타임아웃 45초, 동시 실행 2개다. 원문에는 실제 응답 모델·usage·시각·프롬프트 SHA-256·provider content를 남겼다. API 키는 저장하지 않았다.

기준선 10회 시도 중 timeout 1회와 빈 rule note 계약실패 1회가 나와 11·12회차를 추가했다. 수정 세 버전도 같은 12회차 스케줄을 실행했다. 성공 10쌍은 1~8·11·12회차다. 생성 단계 총 48회 시도와 별도 사진 분석 1회를 사용했다. 청구 비용은 계산하지 않았다.

```sh
node --env-file=/절대경로/.env docs/specs/101-caption-quality/measure.mjs prepare
node --env-file=/절대경로/.env docs/specs/101-caption-quality/measure.mjs before
node --env-file=/절대경로/.env docs/specs/101-caption-quality/measure.mjs after
node docs/specs/101-caption-quality/summarize.mjs
python3 docs/specs/101-caption-quality/write-report.py
```

prepare의 복구 결과와 phase JSON이 있으면 이어서 읽는다. 새 측정은 기존 원자료를 별도 보존한 뒤 실행해야 한다. before 재측정은 caption-before.md/title-before.md의 프롬프트 상태에서 수행한다. 원자료와 동일 프롬프트 해시인지 확인한다.

## 전후 실측

'''
md+='|항목|수정 전|최종 수정 후|\n|---|---:|---:|\n'
for name,key in [('시도','attempts'),('생성 성공','success'),('filled 슬롯','filled'),('omitted 슬롯','omitted'),('평균 캡션 문자 수','mean_caption_length'),('설명형 보조 지표 해당 슬롯','description_marker_count'),('보입니다/있습니다 해당 슬롯','formal_description_ending_count')]:md+=f'|{name}|{m["before"][key]}|{m["after"][key]}|\n'
md+=f'|uploaded_photo note 원문 불일치|{len(m["before"]["unmatched_notes"])}/{m["before"]["uploaded_photo_notes"]}|{len(m["after"]["unmatched_notes"])}/{m["after"]["uploaded_photo_notes"]}|\n|금지어·과장 문자열 검출 회차|0|0|\n'
md+='\n설명형 보조 지표는 `보입니다/있습니다/보인다/있다/모습/화면/상반신/인물` 중 하나가 있는 슬롯 수다. `보입니다/있습니다`만 보면 전후 모두 0이므로 품질 차이를 잡지 못한다. 짧은 문장과 지표 감소는 게시 가능성의 증명이 아니다. note 일치 검사도 의미상 근거 충분성까지 증명하지 않는다.\n\n'
md+='## 에이전트 판정과 사람 판정\n\n5분 1차 검토용 [human-review.md](human-review.md)에 O/X 칸을 남겼다. 전수 문장은 [comparison.md](comparison.md), 슬롯별 판정·사유·사실 오류는 [judgments.json](judgments.json)에 있다. 작성자 에이전트가 사진과 문장을 읽은 비블라인드 판정이므로 독립 사용자 조사로 취급하지 않는다. **사람 판정은 0건, 통과율은 미측정**이다.\n\n|회차|전 캡션/filled|후 캡션/filled|후 전체 15슬롯 중 과반|\n|---|---:|---:|---|\n'
for run in range(1,13):
 cells=[];after_count=0
 for phase in ['before','after']:
  rows=[j for j in judgments if j['phase']==phase and j['run']==run]
  n=sum(j['verdict']=='캡션 초안' for j in rows);filled=sum(j['text'] is not None for j in rows)
  cells.append(f'{n}/{filled} ({100*n/filled:.1f}%)' if filled else '생성 실패')
  if phase=='after':after_count=n
 md+=f'|{run}|{cells[0]}|{cells[1]}|{"예" if after_count>7 else "아니오"}|\n'
for phase in phases:
 rows=[j for j in judgments if j['phase']==phase];n=sum(j['verdict']=='캡션 초안' for j in rows);filled=sum(j['text'] is not None for j in rows)
 md+=f'\n{phase}: filled 기준 {n}/{filled} ({100*n/filled:.1f}%). 생성 성공 회차의 모든 슬롯 기준 {n}/{len(rows)} ({100*n/len(rows):.1f}%).\n'
md+='''
12회차 일부는 캡션 구절로 판단했지만, 대부분 회차가 설명문이고 사실 위반도 있어 전체 통과가 아니다. 초기 두 버전은 after-v1.json(11/12 성공)·after-v2.json(12/12 성공)에 보존했다. 첫 버전에는 광고 문구·계절·기분 추론, 두 번째에는 잘못된 색·의류 겹침과 계절 추론이 남았다. 마지막 버전도 이를 완전히 막지 못했다.

## 실제 실패와 경계

|구분|회차·사진|실제 출력|대조 근거|
|---|---|---|---|
|최종 S4|4 / cq_03|갈색 스웨이드 재킷 위 흰 리본 끈 상의|사실은 재킷 안에 흰 리본 끈 상의를 입었다|
|최종 S4|5 / cq_10|손가락마다 반지|사실은 여러 손가락에 반지를 꼈다. 전체 손가락으로 확대했다|
|최종 위치 모호성|12 / cq_06|크림색 소파 위 검은색 핸드백|사실은 무릎 앞에 놓여 있다. 보수적 탈락|
|최종 P2|11 / 7개 비움 슬롯|사진 속 묘사 가능한 사실이 부족합니다.|각 사진에 여러 사실이 있는데 원문 대신 부족하다는 note를 생성했다|
|기준선 S4|2 / cq_04|분홍색 신발|음식 사진과 입력에 없는 사물|
|기준선 S4|1 / cq_08|하늘색 상의|입력은 흰색 상의|

S4 위반 0건 조건은 **미충족**이다. 이 표는 발견한 구체 사례이며 전체 제품에서의 발생률 추정이 아니다. 금지어 0건을 S4 통과로 해석하지 않는다. P3 비움은 유지했으나 11회차의 부정확한 note를 정상 비움 근거로 인정하지 않는다.

## 타이틀 전수

|회차|전|후|
|---|---|---|
'''
for b in phases['before']:
 a=next(r for r in phases['after'] if r['run']==b['run'])
 title=lambda r:r.get('result',{}).get('output',{}).get('title',r.get('error',{}).get('code','실패'))
 md+=f'|{b["run"]}|{title(b)}|{title(a)}|\n'
md+='\n최종 12개 타이틀에서 단일 사진의 광고 숫자·시즌을 묶음의 사실로 올린 사례는 발견하지 못했다. 중립 폴백이 반복돼 타이틀의 제품 가치는 아직 낮다. 최종 2회차의 열다섯 장은 실제 입력 장수이며 광고 숫자가 아니다.\n\n## 다섯 검증 명령의 실제 출력\n\n환경: Node v22.22.3, npm 10.9.8. npm ci 성공(464개 설치, 취약점 0). package engines는 24.x여서 엔진 경고가 있었으며 Node 24 재검증은 미실행이다.\n'
for check in checks:
 log=(root/check['log']).read_text()
 if check['command']=='npm run test':log='\n'.join(log.splitlines()[-9:])
 elif check['command']=='npm run eval':log='\n'.join(log.splitlines()[-14:])
 md+=f'\n### `{check["command"]}` — 종료 {check["exit_code"]}\n\n```text\n{log.strip()}\n```\n\n전체 출력: [{check["log"]}]({check["log"]}).\n'
md+='''
check는 기초 JS/JSON, lint는 설정상 src와 설정 파일을 검사한다. 두 실험 스크립트는 별도로 node --check를 통과했다. 기존 생성 계약 208개 테스트의 통과는 새 캡션 문체의 보증이 아니다. 프롬프트 문구만 비교하는 형식적 테스트는 추가하지 않았다.

## 남은 것과 인수

- 세 번 수정 후에도 재현된 S4/P2/게시 문체 실패를 이슈 댓글로 남기고 칸반을 **막힘**으로 변경했다. 이슈는 닫지 않는다.
- 사람의 전후 전수 판정, 다른 모델의 독립 리뷰, Node 24 검증은 미실행이다.
- rationale 입력 축소와 합친 뒤에도 효과가 있는지 별도 확인이 필요하다. 현재 보고는 그 변경 없이 측정한 결과다.
- 모델 교체·입력 계약 변경·후처리 우회·배포·merge는 하지 않았다.
- PR base는 코디네이터의 2026-09-18 응답으로 develop을 확정했다. dev는 폐기된 브랜치이며 origin/dev는 사용하지 않는다. Draft PR은 품질 미통과와 사람 판정 pending을 명시한다.
'''
(root/'report.md').write_text(md)
print('Report written; accepted',sum(j['verdict']=='캡션 초안' for j in judgments))
