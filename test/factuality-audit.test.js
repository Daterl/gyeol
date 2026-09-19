import assert from 'node:assert/strict';
import test from 'node:test';
import { audit } from '../scripts/factuality-audit.mjs';

// 판정 파일이 생성 결과의 모든 줄을 덮지 않으면 audit() 가 던진다 (#129).
test('#129 대조표는 생성 결과의 모든 타이틀·캡션·비움 이유를 덮는다', () => {
  const { rows, counts } = audit();
  assert.equal(rows.length, counts.total);
  assert.equal(counts.supported + counts.distorted + counts.absent, counts.total);
  assert.equal(rows.filter((r) => r.kind === 'title').length, 2);
  assert.equal(rows.filter((r) => r.kind === 'caption' || r.kind === 'omit_reason').length, 30);
});

// 빈 판정을 "오류 0건"으로 올려 읽지 않는다.
test('#129 사람 인수는 채워지기 전까지 null 이다', () => {
  const { verdicts } = audit();
  assert.equal(verdicts.reviewer.human_signoff, null);
});
