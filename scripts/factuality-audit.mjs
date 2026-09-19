#!/usr/bin/env node
// #129 — 타이틀·캡션·비움 이유를 사진의 describable_facts 와 전수 대조한 표를 만든다.
// 판정은 docs/submission/factuality-verdicts.json 에 손으로 적혀 있고, 이 스크립트는
// 원문을 붙이고 빠진 줄을 거부하고 숫자를 센다. 새 모델 호출은 하지 않는다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const P = {
  verdicts: 'docs/submission/factuality-verdicts.json',
  out: 'docs/submission/factuality-audit.md',
};

const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

export function audit() {
  const verdicts = JSON.parse(read(P.verdicts));
  const genRaw = read(verdicts.source.generation);
  const inputsRaw = read(verdicts.source.observations);
  const runs = JSON.parse(genRaw);
  const inputs = JSON.parse(inputsRaw);

  const facts = new Map();
  for (const c of inputs) {
    for (const s of c.request.feed.slots) {
      if (!facts.has(s.photo_id)) facts.set(s.photo_id, s.caption_inputs.describable_facts);
    }
  }

  // 원문 줄을 원본에서 만든다. 판정 파일이 아니라 생성 결과가 기준이다.
  const expected = [];
  for (const runNo of verdicts.source.runs) {
    const run = runs.find((r) => r.run === runNo);
    if (!run) throw new Error(`run ${runNo} not found in ${verdicts.source.generation}`);
    if (run.requested_model !== verdicts.source.model) {
      throw new Error(`run ${runNo} model ${run.requested_model} != ${verdicts.source.model}`);
    }
    expected.push({ kind: 'title', run: runNo, text: run.result.output.title });
    for (const slot of run.result.output.slots) {
      expected.push({
        kind: slot.caption_state === 'omitted' ? 'omit_reason' : 'caption',
        run: runNo,
        position: slot.position,
        photo_id: slot.photo_id,
        text: slot.caption_state === 'omitted' ? slot.omit_reason : slot.text,
      });
    }
  }

  const key = (r) => `${r.run}/${r.kind}/${r.position ?? '-'}`;
  const byKey = new Map(verdicts.rows.map((r) => [key(r), r]));
  const rows = expected.map((e) => {
    const v = byKey.get(key(e));
    if (!v) throw new Error(`판정 없음: ${key(e)} (${e.photo_id ?? 'title'})`);
    if (!['supported', 'distorted', 'absent'].includes(v.verdict)) {
      throw new Error(`알 수 없는 verdict: ${key(e)} = ${v.verdict}`);
    }
    if (e.kind === 'title' && v.text !== e.text) {
      throw new Error(`타이틀 원문 불일치: "${v.text}" != "${e.text}"`);
    }
    byKey.delete(key(e));
    return { ...e, ...v };
  });
  if (byKey.size) throw new Error(`원본에 없는 판정 줄: ${[...byKey.keys()].join(', ')}`);

  const counts = {
    total: rows.length,
    supported: rows.filter((r) => r.verdict === 'supported').length,
    distorted: rows.filter((r) => r.verdict === 'distorted').length,
    absent: rows.filter((r) => r.verdict === 'absent').length,
    unsupported_place_person_time: rows.filter((r) => r.unsupported_ppt).length,
  };
  return { verdicts, rows, counts, facts, digests: { generation: sha(genRaw), observations: sha(inputsRaw) } };
}

function render({ verdicts, rows, counts, facts, digests }) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const src = (r) =>
    r.verdict === 'absent'
      ? '**사실에 없다**'
      : r.facts.map((i) => `F${i} ${esc(facts.get(r.photo_id)?.[i - 1] ?? '')}`).join('<br>');

  const lines = [
    '# #129 사실성 전수 대조표 — 타이틀·캡션·비움 이유',
    '',
    '> 생성되는 파일이다. 고치려면 `docs/submission/factuality-verdicts.json` 을 고치고 다시 만든다.',
    '',
    '## 다시 하려면',
    '',
    '```sh',
    'node scripts/factuality-audit.mjs   # 판정 파일 + 생성 결과 → 이 표를 다시 만든다',
    '```',
    '',
    '## 무엇을 무엇과 대조했나',
    '',
    `- 생성 결과: \`${verdicts.source.generation}\` run ${verdicts.source.runs.join('·')} — 실사진 15장 1벌, 실제 모델 \`${verdicts.source.model}\`, ${verdicts.source.generated_at} (sha256:${digests.generation})`,
    `- 관측 사실: \`${verdicts.source.observations}\` 의 \`describable_facts\` (sha256:${digests.observations})`,
    `- 대조한 주체: ${verdicts.reviewer.name}, ${verdicts.reviewer.reviewed_at}`,
    `- 대조 근거: ${verdicts.reviewer.basis}`,
    `- 사람 인수: ${verdicts.reviewer.human_signoff ?? '**PENDING** — 원본 사진 이미지가 저장소에 없어 사진 대조는 못 했다. 사람이 원본을 보고 이 표를 확인하기 전까지 인수가 아니다.'}`,
    '',
    '## 센 숫자',
    '',
    '| 무엇 | 몇 개 |',
    '|---|---:|',
    `| 대조한 문장 (타이틀 2 + 캡션 22 + 비움 이유 8) | ${counts.total} |`,
    `| 관측 사실로 역추적된다 | ${counts.supported} |`,
    `| 사실은 있으나 어긋나게 옮겼다 | ${counts.distorted} |`,
    `| 어느 관측 사실에도 없다 | ${counts.absent} |`,
    `| **사진에 없는 장소·인물·시간이 들어간 문장** | **${counts.unsupported_place_person_time}** |`,
    '',
    `장소·인물·시간을 지어낸 문장은 ${counts.unsupported_place_person_time}개다. 대신 걸린 것은 타이틀 ${counts.absent}개가 관측 사실에 아예 근거가 없다는 것과, 캡션·비움 이유 ${counts.distorted}개가 있는 사실을 어긋나게 옮겼다는 것이다.`,
    '',
    '## 표',
    '',
    '| run | 자리 | 사진 | 종류 | 문장 | 판정 | 어느 describable_facts 에서 왔나 | 메모 |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.run} | ${r.position ?? '—'} | ${r.photo_id ?? '—'} | ${r.kind} | ${esc(r.text)} | ${r.verdict} | ${src(r)} | ${esc(r.note ?? '')} |`,
    );
  }
  lines.push('', '## 이 표가 못 보는 것', '', '- 원본 사진 이미지를 보지 않았다. 관측 사실 기록이 원본과 다르면 이 표도 같이 틀린다 (`docs/specs/101-caption-quality/report.md` 에 기록된 관측 오류 참고).', '- 실행 시점의 실제 모델 재호출이 아니라 2026-09-18 에 기록된 실행 결과를 읽는다.', '- 판정은 사람 인수 전까지 PENDING 이다.', '');
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = audit();
  writeFileSync(new URL(P.out, ROOT), render(result));
  console.log(JSON.stringify(result.counts, null, 2));
  console.log(`wrote ${P.out}`);
}
