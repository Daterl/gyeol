#!/usr/bin/env node
// #129 — 타이틀·캡션·비움 이유를 사진의 describable_facts 와 전수 대조한 표를 만든다.
// 관측 사실 자체는 원본 사진 15장을 에이전트가 직접 열어 확인했고 그 결과는 verdicts.photos 에 있다.
// 판정은 docs/submission/factuality-verdicts.json 에 손으로 적혀 있고, 이 스크립트는
// 원문을 붙이고 빠진 줄을 거부하고 숫자를 센다. 새 모델 호출은 하지 않는다.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

  // 표에 나오는 모든 사진은 원본 육안 확인 기록이 있어야 한다.
  const photos = new Map(verdicts.photos.items.map((p) => [p.photo_id, p]));
  for (const r of rows) {
    if (r.photo_id && !photos.has(r.photo_id)) throw new Error(`사진 육안 확인 기록 없음: ${r.photo_id}`);
  }
  for (const p of photos.values()) {
    if (!['confirmed', 'imprecise'].includes(p.image_check)) {
      throw new Error(`알 수 없는 image_check: ${p.photo_id} = ${p.image_check}`);
    }
  }

  // 원본 디렉터리가 이 기계에 있으면 sha256 을 실제로 맞춰 본다. 없으면 건너뛴다.
  let imagesVerified = null;
  if (existsSync(verdicts.photos.images_dir)) {
    imagesVerified = 0;
    for (const p of photos.values()) {
      const got = createHash('sha256')
        .update(readFileSync(`${verdicts.photos.images_dir}/${p.file_ref}`))
        .digest('hex');
      if (got !== p.sha256) throw new Error(`사진 sha256 불일치: ${p.photo_id} ${p.file_ref}`);
      imagesVerified += 1;
    }
  }

  const counts = {
    total: rows.length,
    supported: rows.filter((r) => r.verdict === 'supported').length,
    distorted: rows.filter((r) => r.verdict === 'distorted').length,
    absent: rows.filter((r) => r.verdict === 'absent').length,
    unsupported_place_person_time: rows.filter((r) => r.unsupported_ppt).length,
    photos: photos.size,
    distinct_photos: new Set([...photos.values()].map((p) => p.sha256)).size,
    images_confirmed: [...photos.values()].filter((p) => p.image_check === 'confirmed').length,
    images_imprecise: [...photos.values()].filter((p) => p.image_check === 'imprecise').length,
  };
  return { verdicts, rows, counts, facts, photos, imagesVerified, digests: { generation: sha(genRaw), observations: sha(inputsRaw) } };
}

function render({ verdicts, rows, counts, facts, photos, imagesVerified, digests }) {
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
    `- 원본 사진: \`${verdicts.photos.images_dir}\` 의 ${counts.photos}장 (서로 다른 파일 ${counts.distinct_photos}개). ${verdicts.photos.inspected_by}, ${verdicts.photos.inspected_at}`,
    `- 사람 인수: ${verdicts.reviewer.human_signoff ?? '**PENDING** — 여기까지는 전부 에이전트가 판정했다. 사람이 확인하기 전까지 인수가 아니다.'}`,
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
    `| 원본을 열어 확인한 사진 | ${counts.photos} (서로 다른 파일 ${counts.distinct_photos}) |`,
    `| 인용한 관측 사실이 사진과 맞는 사진 | ${counts.images_confirmed} |`,
    `| 인용한 관측 사실이 사진과 어긋나는 사진 | ${counts.images_imprecise} |`,
    '',
    `장소·인물·시간을 지어낸 문장은 ${counts.unsupported_place_person_time}개다. 대신 걸린 것은 타이틀 ${counts.absent}개가 관측 사실에 아예 근거가 없다는 것과, 캡션·비움 이유 ${counts.distorted}개가 있는 사실을 어긋나게 옮겼다는 것이다.`,
    '',
    `원본 사진 ${counts.photos}장을 전부 열어 이 표가 인용한 관측 사실을 확인했다. ${counts.images_confirmed}장은 사진과 맞고, ${counts.images_imprecise}장(cq_10)은 관측 단계에서 색 이름이 어긋나 있다 — 생성 문장이 아니라 그 앞 단계의 오차다. 사진 ${counts.photos}장 중 서로 다른 파일은 ${counts.distinct_photos}개이며 cq_01 과 cq_13 은 sha256 이 같다.`,
    '',
    '## 어느 사진 파일인가 — cq_01..cq_15 대응',
    '',
    `- 대응 출처: ${verdicts.photos.mapping_source}`,
    `- 확인 방법: ${verdicts.photos.method}`,
    `- sha256 실제 대조: ${imagesVerified === null ? '이 기계에 원본 디렉터리가 없어 건너뜀 (기록된 값만 싣는다)' : `${imagesVerified}/${counts.photos}장 일치`}`,
    '',
    '| 사진 | 파일 | sha256 | 사진과 맞나 | 무엇을 봤나 |',
    '|---|---|---|---|---|',
    ...[...photos.values()].map(
      (p) => `| ${p.photo_id} | \`${p.file_ref}\` | \`${p.sha256.slice(0, 12)}\` | ${p.image_check} | ${esc(p.note)} |`,
    ),
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
  lines.push(
    '',
    '## 이 표가 못 보는 것',
    '',
    '- 사진 확인은 **이 표가 인용한 describable_facts 만** 대상으로 했다. 인용되지 않은 사실의 정확성은 확인 범위 밖이다.',
    '- 원본은 긴 변 1400px 로 축소해 열었다. 그보다 작은 글자·질감은 판별하지 못했을 수 있다.',
    '- 실행 시점의 실제 모델 재호출이 아니라 2026-09-18 에 기록된 실행 결과를 읽는다.',
    '- **판정 주체는 전부 에이전트다.** 사람 인수는 PENDING 이고, 에이전트 육안 확인이 사람 인수를 대신하지 않는다.',
    '',
  );
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = audit();
  writeFileSync(new URL(P.out, ROOT), render(result));
  console.log(JSON.stringify(result.counts, null, 2));
  console.log(`wrote ${P.out}`);
}
