// 이슈 #96 재현·검증 하네스. 실모델을 부른다.
//
//   node docs/specs/96-rationale-leak/probe.mjs build <이미지폴더> <feed.json>
//   node docs/specs/96-rationale-leak/probe.mjs run    <feed.json> <횟수> <결과.json>
//   node docs/specs/96-rationale-leak/probe.mjs rescan <결과.json>   # 모델 호출 없이 재채점
//
// build 는 사진 분석(사진 1장 = 호출 1회) → buildFeed 까지 한 번만 돌려 feed+context 를
// 디스크에 고정한다. run 은 그 동일 입력으로 generateOutput 을 N회 돌리고,
// title · slots[].text · slots[].omit_reason 을 금지 패턴으로 기계 탐지한다.
// 같은 feed.json 을 수정 전/후에 재사용해야 통제된 비교가 된다.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { analyzePhoto } from '../../../lib/photo_analysis.js';
import { buildFeed } from '../../../lib/pipeline.js';
import { generateOutput } from '../../../lib/output-generation.js';

// lib/order.js 의 rationale·evidence 생성기에서 실제로 나오는 어휘.
// 이슈 DoD 의 5개(색 거리 · 밝기 0. · 채도 0. · 점수가 · 자리에 뒀다)를 포함한 상위집합이다.
const BANNED = [
  ['색 거리', /색\s*거리/], ['측정 색', /측정\s*색/], ['색상각', /색상각/],
  ['지향 방향', /지향\s*방향/], ['지향이 잰', /지향이\s*잰/],
  ['앞자리', /앞자리/], ['N번에 뒀다', /번에\s*뒀다/], ['자리에 뒀다', /자리에\s*뒀다/],
  ['전환 자리', /전환\s*자리/],
  ['점수', /점수/], ['총점', /총점/], ['보너스', /보너스/], ['측정값', /측정값/], ['상위 밴드', /상위\s*밴드/],
  // 밝기·채도·측정은 order.js 의 측정 어휘다. 이 feed 의 describable_facts 129건 어디에도
  // 나오지 않으므로(probe 로 확인) 출력에 등장하면 사진의 사실이 아니라 내부 규칙에서 온 것이다.
  ['밝기', /밝기/], ['채도', /채도/], ['측정', /측정/], ['한 색이 넓게', /한\s*색이\s*넓게/],
  ['서사 규칙', /서사\s*규칙/], ['R1~R4', /\bR[1-4]\b/], ['order.r*', /order\.r\d/i],
  ['내부 필드명', /narrative_role|adjacent_overlap|is_visual_peak|caption_inputs|rationale/],
  ['서사 역할어', /\b(opener|sustain|closer)\b/i],
  ['소수 3자리 수치', /\d\.\d{3,}/]
];

const scan = (where, text) => text == null ? []
  : BANNED.filter(([, re]) => re.test(text)).map(([label]) => ({ where, label, text }));

const REFERENCE_URL = 'https://instagram.com/29cm';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// 후보를 순서대로 분석해 want 장을 채운다. 분석 자체가 실패한 사진(모델이 계약을 어긴 응답을
// 준 경우 등)은 건너뛴다 — 이 이슈의 대상은 분석이 아니라 출력 생성이고, 값을 지어내지 않는다.
async function analyzeFolder(folder, candidates, prefix, want) {
  const out = [], skipped = [];
  for (const name of candidates) {
    if (out.length === want) break;
    const bytes = await readFile(join(folder, name));
    try {
      const { analysis } = await analyzePhoto({
        bytes, photoId: `${prefix}${String(out.length + 1).padStart(2, '0')}`, inputIndex: out.length,
        fileRef: relative(process.cwd(), join(folder, name))
      });
      process.stderr.write(`  분석 ${analysis.photo_id} [${analysis.analysis_source}] 사실 ${analysis.describable_facts.length}개 ${name}\n`);
      out.push(analysis);
    } catch (error) {
      skipped.push(`${name}: ${error.code ?? error.name} ${error.message}`);
      process.stderr.write(`  건너뜀 ${name} — ${error.code ?? error.name}: ${error.message}\n`);
    }
  }
  if (out.length < want) throw new Error(`분석 가능한 사진이 ${out.length}장뿐이다 (필요 ${want}장)`);
  return out;
}

async function build(folder, outPath) {
  const all = (await readdir(folder)).filter(n => IMAGE_EXT.has(extname(n).toLowerCase())).sort();
  // 선택 사진 11장(이슈 관측 조건) + 기존 게시물 4장. 겹치지 않는 파일에서 가져온다.
  // 분석 결과는 사이드카에 남긴다. 뒤 단계가 실패해도 vision 호출 15회를 다시 태우지 않는다.
  const sidecar = outPath + '.analyses.json';
  let photos, currentPhotos;
  try {
    ({ photos, currentPhotos } = JSON.parse(await readFile(sidecar, 'utf8')));
    process.stderr.write(`사진 분석 재사용: ${sidecar} (선택 ${photos.length}장 · 기존 ${currentPhotos.length}장, 모델 호출 0회)\n`);
  } catch {
    process.stderr.write('선택 사진 11장 분석 (사진 1장 = 호출 1회)\n');
    photos = await analyzeFolder(folder, all.slice(0, 25), 'ph_', 11);
    process.stderr.write('기존 게시물 4장 분석\n');
    currentPhotos = await analyzeFolder(folder, all.slice(200, 215), 'old_', 4);
    await writeFile(sidecar, JSON.stringify({ photos, currentPhotos }, null, 2));
  }
  const captions = ['가을 신상 입고했습니다', '', '오늘의 무드', '주말 배송 안내드려요'];
  const built = await buildFeed({
    schema_version: '1.0', session_id: 'issue96-probe', photos,
    identity: { target: { kind: 'reference', url: REFERENCE_URL }, current: { kind: 'posts', photos: currentPhotos, captions } }
  });
  await writeFile(outPath, JSON.stringify(built, null, 2));
  process.stderr.write(`\nfeed 고정: ${outPath} (슬롯 ${built.feed.slots.length}개)\n`);
  process.stderr.write('— 순서 근거(rationale) 원문, 이것이 유출원이다 —\n');
  for (const s of [...built.feed.slots].sort((a, b) => a.position - b.position)) {
    process.stderr.write(`  ${s.position}. ${s.rationale.value}\n`);
  }
}

const scanRound = output => [
  ...scan('title', output.title),
  // 검증이 닫는 면과 같은 면을 본다: 근거 note 도 사용자가 펼쳐 읽는 문장이다 (PR #108 리뷰).
  ...output.slots.flatMap(s => [...scan(`slot${s.position}.text`, s.text), ...scan(`slot${s.position}.omit_reason`, s.omit_reason),
    ...s.evidence.flatMap((e, i) => scan(`slot${s.position}.evidence[${i}].note`, e.note))])
];

// 이미 저장된 회차를 모델 호출 없이 현재 금지 목록으로 다시 채점한다.
async function rescan(resultPath) {
  const saved = JSON.parse(await readFile(resultPath, 'utf8'));
  saved.rounds = saved.rounds.map(r => r.ok ? { ...r, hits: scanRound(r) } : r);
  saved.leakedRounds = saved.rounds.filter(r => r.ok && r.hits.length).length;
  for (const r of saved.rounds) {
    process.stderr.write(r.ok
      ? `${String(r.round).padStart(2)}회  히트 ${r.hits.length}건  title="${r.title}"\n`
        + r.hits.map(h => `      ⚠ [${h.label}] ${h.where}: ${h.text}\n`).join('')
      : `${String(r.round).padStart(2)}회  실패 ${r.error}\n`);
  }
  await writeFile(resultPath, JSON.stringify(saved, null, 2));
  process.stderr.write(`\n재채점: 성공 ${saved.generated}/${saved.times} · 유출 관측 ${saved.leakedRounds}회\n`);
}

async function run(feedPath, times, outPath) {
  const built = JSON.parse(await readFile(feedPath, 'utf8'));
  const input = { schema_version: '1.0', mode: 'all', feed: built.feed, context: built.context };
  const rounds = [];
  for (let i = 1; i <= times; i++) {
    const started = Date.now();
    let record;
    // 거부된 회차의 원인을 사람이 판별할 수 있어야 한다 — 실제 유출인지 과잉 거부인지는
    // provider 원문을 봐야 갈린다. 그래서 응답 원문을 떠 둔다 (PR #108 리뷰).
    const raw = [];
    const spy = async (url, options) => {
      const response = await globalThis.fetch(url, options);
      if (!url.includes('/models/')) raw.push(await response.clone().text());
      return response;
    };
    try {
      const { output } = await generateOutput(structuredClone(input), { fetchImpl: spy });
      record = { round: i, ok: true, ms: Date.now() - started, title: output.title, hits: scanRound(output), slots: output.slots };
    } catch (error) {
      const provider = (() => { try { return JSON.parse(JSON.parse(raw.at(-1)).content[0].text); } catch { return null; } })();
      record = { round: i, ok: false, ms: Date.now() - started, error: `${error.code ?? error.name}: ${error.message}`,
        rejected_hits: provider?.output ? scanRound(provider.output) : null, provider_output: provider?.output ?? null };
    }
    rounds.push(record);
    process.stderr.write(record.ok
      ? `${String(i).padStart(2)}회 ${record.ms}ms  히트 ${record.hits.length}건  title="${record.title}"\n`
        + record.hits.map(h => `      ⚠ [${h.label}] ${h.where}: ${h.text}\n`).join('')
      : `${String(i).padStart(2)}회 ${record.ms}ms  거부 ${record.error}\n`
        + (record.rejected_hits ?? []).map(h => `      ⛔ [${h.label}] ${h.where}: ${h.text}\n`).join('')
        + (record.rejected_hits?.length === 0 ? `      ? 금지 표현 히트 0건 — 유출이 아닌 다른 계약 실패이거나 과잉 거부다\n` : ''));
  }
  const leaked = rounds.filter(r => r.ok && r.hits.length);
  const failed = rounds.filter(r => !r.ok);
  const rejectedWithLeak = failed.filter(r => r.rejected_hits?.length).length;
  const summary = { feed: feedPath, times, generated: rounds.length - failed.length, failed: failed.length,
    leakedRounds: leaked.length, rejectedWithLeak, rejectedWithoutLeak: failed.length - rejectedWithLeak, rounds };
  await writeFile(outPath, JSON.stringify(summary, null, 2));
  process.stderr.write(`\n성공 ${summary.generated}/${times} · 거부 ${failed.length}회`
    + ` (금지 표현 있음 ${summary.rejectedWithLeak} · 없음 ${summary.rejectedWithoutLeak})`
    + ` · 사용자 결과에 남은 유출 ${leaked.length}회\n결과: ${outPath}\n`);
  process.exitCode = 0;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'build') await build(rest[0], rest[1]);
else if (cmd === 'run') await run(rest[0], Number(rest[1]), rest[2]);
else if (cmd === 'rescan') await rescan(rest[0]);
else { process.stderr.write('usage: probe.mjs build <folder> <feed.json> | run <feed.json> <times> <out.json> | rescan <out.json>\n'); process.exitCode = 2; }
