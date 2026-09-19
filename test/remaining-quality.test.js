import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildArtifact, validateArtifact, renderReview} from '../scripts/remaining-quality.mjs';
const originalFetch=globalThis.fetch;
let artifact;
try {
  globalThis.fetch=()=>{throw new Error('Network forbidden in offline acceptance');};
  artifact=await buildArtifact();
} finally { globalThis.fetch=originalFetch; }
test('covers 3/15 photos crossed with blank/written direction', () => {
  assert.deepEqual(artifact.runs.map(r => [r.count,r.prompt]), [[3,'blank'],[3,'written'],[15,'blank'],[15,'written']]);
  assert.equal(artifact.runs.reduce((n,r)=>n+r.rows.length,0),36);
  validateArtifact(artifact);
});
test('preserves fixture identity across prompt variants', () => {
  for(const count of [3,15]) {
    const [a,b]=artifact.runs.filter(r=>r.count===count);
    assert.deepEqual(a.photos,b.photos);
    assert.equal(a.photos_sha256,b.photos_sha256);
  }
});
test('rejects mutated observation even if its digest is recomputed', () => {
  const changed=structuredClone(artifact);
  changed.runs[0].photos[0].describable_facts[0]='invented';
  changed.runs[0].photos_sha256=createHash('sha256').update(JSON.stringify(changed.runs[0].photos)).digest('hex');
  assert.throws(()=>validateArtifact(changed));
});
test('rejects missing row and mismatched photo attribution', () => {
  for(const edit of [a=>a.runs[0].rows.pop(),a=>a.runs[0].rows[0].photo_id='ghost']) {
    const changed=structuredClone(artifact);edit(changed);assert.throws(()=>validateArtifact(changed));
  }
});
test('missing live and human evidence cannot be promoted to PASS or zero errors', () => {
  for(const edit of [a=>a.acceptance.live_model='PASS',a=>a.acceptance.human='PASS',a=>a.acceptance.unsupported_claim_count=0,a=>a.runs[0].rows[0].human.verdict='PASS']) {
    const changed=structuredClone(artifact);edit(changed);assert.throws(()=>validateArtifact(changed));
  }
});
test('review contains every photo and labels simulated text and unmeasured verdicts', () => {
  const md=renderReview(artifact);
  assert.match(md,/FAKE/);assert.match(md,/PENDING/);
  assert.equal(md.split('| □ |').length-1,36);
});

test('same-observation control abstains instead of manufacturing ten distinct reasons', () => {
  assert.ok(artifact.same_observation_probe.unique_rationale_count<10);
  assert.ok(artifact.same_observation_probe.rows.every(r=>r.evidence.some(e=>e.ref==='order.placement_limit')));
});

test('checked-in worksheet exactly renders its validated evidence artifact', async () => {
  const saved=JSON.parse(await readFile(new URL('../docs/specs/remaining-quality/offline-evidence.json',import.meta.url),'utf8'));
  validateArtifact(saved);
  assert.equal(await readFile(new URL('../docs/specs/remaining-quality/human-review.md',import.meta.url),'utf8'),renderReview(saved));
});
