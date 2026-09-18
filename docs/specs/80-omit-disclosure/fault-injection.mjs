// #80 결함 주입 — 서버의 계수 코드를 실제로 망가뜨리고 /api/generate 가 거부하는지 본다.
//
// 목(mock) provider 를 쓴다. 여기서 보려는 것은 모델 품질이 아니라 계약 검증의 동작이다.
// 두 회차(비움 0개 / 비움 3개)를 각각 돌린다 — 같은 결함이라도 그 회차에서 실제로
// 틀린 값이 될 때만 거부되어야 한다.
//
// 실행: node docs/specs/80-omit-disclosure/fault-injection.mjs
// 끝나면 lib/output-generation.js 를 원본으로 복구한다. 결과는 report.md 3절.
import {readFile, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const target = new URL('../../../lib/output-generation.js', import.meta.url);
const probe = new URL('./fault-injection-probe.mjs', import.meta.url);
const original = await readFile(target, 'utf8');

const FAULTS = [
  ['개수 틀림 (omitted+1)', 'omitted, total,', 'omitted: omitted+1, total,'],
  ['총계 틀림 (total=15)', 'omitted, total,', 'omitted, total: 15,'],
  ["키 틀림 (항상 some)", "note_key: omitted===0?'omission.none':'omission.some',", "note_key: 'omission.some',"],
  ["키 틀림 (항상 none)", "note_key: omitted===0?'omission.none':'omission.some',", "note_key: 'omission.none',"],
  ['근거 규칙 제거', "evidence: [{kind:'rule',ref:OMISSION_RULE,", "evidence: [{kind:'rule',ref:'gyeol.omit.overlap',"],
  ['note 비움', 'note: omitted===0', "note: '', _dropped: omitted===0"]
];

try {
  for (const round of ['none', 'some']) {
    console.log(`\n### ${round === 'none' ? '비움 0개' : '비움 3개'} 회차`);
    for (const [label, from, to] of [['(주입 없음 — 기준선)', '', ''], ...FAULTS]) {
      if (from && !original.includes(from)) { console.log(`${label}: 앵커를 찾지 못했다 — 주입 실패`); continue; }
      await writeFile(target, from ? original.replace(from, to) : original);
      const {stdout} = await run('node', [probe.pathname, round]);
      console.log(`${label.padEnd(26)} → ${stdout.trim()}`);
    }
  }
} finally {
  await writeFile(target, original);
  console.log('\n원본 복구 완료');
}
