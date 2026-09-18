"""기계 검사는 형식/원문 일치만 집계한다. S4와 사람 판정은 자동으로 통과시키지 않는다."""
import json, re, sys
from pathlib import Path
root=Path(__file__).parent
label=sys.argv[1]
rows=json.loads((root/(label+'.json')).read_text())
inputs={x['name']:x['request'] for x in json.loads((root/'inputs.json').read_text())}
metrics={'attempts':len(rows),'success':sum(r['ok'] for r in rows),'filled':0,'omitted':0,'note_count':0,'note_mismatches':[],'format_errors':[],'nonliteral_seeds':[],'missing_seed_evidence':[],'runs':[]}
unique={f'cq_{i:02}':{} for i in range(1,16)}
lines=['# 사람 판정표 — pending','','1분 안에 자기 캡션을 쓸 수 있는지는 사람이 판단한다. 에이전트는 체크하지 않았다. 사진만 보고 쓰는 빈 칸 조건과 단서를 보는 조건을 서로 다른 참가자에게 배정하고, 사진 및 조건 순서는 바꾼다. 같은 사람이 같은 사진을 두 번 보고 답하면 학습 효과가 섞이므로 비교 증거로 쓰지 않는다.','', '각 슬롯의 O/X와 실제 작성 문장·소요 시간을 사람이 기록한다. 비움은 작성 요청이 아니므로 해당 슬롯의 1분 문항은 N/A이며 비움을 유지할지만 별도 판단한다.','']
for row in rows:
 lines += [f"## {row['run']}회차 — {row['scenario']}",'']
 if not row['ok']:
  lines += [f"실패: {row['error']}",''];continue
 slots=row['result']['output']['slots'];title=row['result']['output']['title']
 omitted=sum(s['caption_state']=='omitted' for s in slots)
 metrics['runs'].append({'run':row['run'],'scenario':row['scenario'],'omitted':omitted,'title':title})
 lines += ['타이틀(수정 대상 아님): '+title,'','|사진|제시된 단서 / 비움 이유|1분 내 작성 가능|빈 칸 조건의 결과|실제 캡션 / 시간|','|---|---|---|---|---|']
 for s in slots:
  pid=s['photo_id'];facts=next(x['caption_inputs']['describable_facts'] for x in inputs[row['scenario']]['feed']['slots'] if x['photo_id']==pid)
  notes=[e['note'] for e in s['evidence'] if e['kind']=='uploaded_photo']
  for note in notes:
   metrics['note_count']+=1
   if note not in facts and not (not facts and note=='확인한 관측 사실이 없음'):
    metrics['note_mismatches'].append({'run':row['run'],'photo_id':pid,'note':note})
  metrics[s['caption_state']]+=1
  if s['caption_state']=='filled':
   text=s['text'];parts=text.split('\n');seeds=parts[0].removeprefix('쓸 거리: ').split(' · ')
   if len(parts)!=2 or not parts[0].startswith('쓸 거리: ') or parts[1]!='이 중 기억에 남은 건?' or not 1<=len(seeds)<=3:
    metrics['format_errors'].append({'run':row['run'],'photo_id':pid,'text':text})
   for seed in seeds:
    unique[pid].setdefault(seed,[]).append(row['run'])
    if not any(seed in fact for fact in facts): metrics['nonliteral_seeds'].append({'run':row['run'],'photo_id':pid,'seed':seed})
    if not any(seed in note for note in notes): metrics['missing_seed_evidence'].append({'run':row['run'],'photo_id':pid,'seed':seed})
   display=text.replace('\n','<br>');check='☐ O ☐ X — pending'
  else: display='비움: '+s['omit_reason'];check='N/A (비움 유지 ☐)'
  lines.append(f'|![{pid}](photos/{pid}.jpg)|{display}|{check}|pending|pending|')
 lines.append('')
(root/(label+'-metrics.json')).write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
(root/(label+'-seeds.json')).write_text(json.dumps(unique,ensure_ascii=False,indent=2)+'\n')
(root/(label+'-human-review.md')).write_text('\n'.join(lines).rstrip()+'\n')
print(json.dumps({k:v for k,v in metrics.items() if k not in ['runs','note_mismatches','format_errors','nonliteral_seeds','missing_seed_evidence']},ensure_ascii=False))
for k in ['note_mismatches','format_errors','nonliteral_seeds','missing_seed_evidence']: print(k,len(metrics[k]))
print([(r['run'],r['omitted']) for r in metrics['runs']])
