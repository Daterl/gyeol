// #97 A — 화면 배치가 거의 같게 관측된 사진에만 빼기를 권한다. 자동 제외는 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildFeed,handleLegacyFeed as handleFeed,handleAnalyze} from '../lib/pipeline.js';
import {validateFeedResponse} from '../lib/interaction.js';
import {resetAnalysisState,measureJpeg} from '../lib/photo_analysis.js';
import {SIMILAR_DISTANCE,withOmitSuggestions} from '../lib/omit-suggestion.js';
import {SIGNATURE_SIDE,signatureDistance,structureSignature} from '../lib/photo_signature.js';
import {validatePhoto,ContractError} from '../lib/contracts.js';
import {authenticateDuplicateFlags,createPhotoReceipt} from '../lib/photo-receipt.js';
import {readJpegBlocks} from '../lib/jpeg_dc.js';

const real=JSON.parse(await readFile(new URL('./order.real20.json',import.meta.url),'utf8'));
const SECRET='test-analysis-receipt-secret-32-characters';
const CELLS=SIGNATURE_SIDE*SIGNATURE_SIDE;
// 구조가 있는 서명 한 벌. 값 자체는 검사 대상이 아니라 거리를 만들기 위한 재료다.
const baseSignature=Array.from({length:CELLS},(_,i)=>Number((Math.sin(i)*1.2).toFixed(3)));
const shifted=delta=>baseSignature.map(v=>Number((v+delta).toFixed(3)));

const photos=(count,decorate=()=>{})=>{
  const list=structuredClone(real.slice(0,count));
  list.forEach((photo,index)=>decorate(photo,index));
  return list;
};
const feedOf=photos=>buildFeed({schema_version:'1.0',session_id:'similar-test',photos,identity:{target:{kind:'none'},current:{kind:'none'}}});
const post=(body,receiptSecret)=>handleFeed(new Request('http://localhost/api/feed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{receiptSecret});
const analyze=(body,receiptSecret=SECRET)=>handleAnalyze(new Request('http://localhost/api/analyze?mock=1',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{receiptSecret});
const byId=feed=>Object.fromEntries(feed.slots.map(s=>[s.photo_id,s.omit_suggestion]));

test('a near-identical structure recommends the later photo, keeps the earlier, and shows the number that decided it',async()=>{
  const list=photos(3,(photo,index)=>{if(index<2) photo.structure_signature=index===0?baseSignature:shifted(0.01);});
  const {feed}=await feedOf(list);
  assert.equal(feed.slots.length,3,'E1: 입력 3장 = 출력 3칸');
  const choices=byId(feed);
  assert.equal(choices.ph_01.recommended,false,'먼저 올린 사진은 남긴다');
  assert.equal(choices.ph_03.recommended,false,'서명이 없는 사진은 권고하지 않는다');
  assert.equal(choices.ph_02.recommended,true);
  const distance=signatureDistance(shifted(0.01),baseSignature);
  // 판정을 바꾼 상수와 측정값이 사용자가 보는 문장과 evidence 에 반드시 함께 나타난다.
  assert.match(choices.ph_02.reason,new RegExp(`ph_01.*구조 거리 ${distance}.*기준 ${SIMILAR_DISTANCE} 미만`));
  assert.deepEqual(choices.ph_02.evidence.map(e=>e.ref),['ph_02','ph_01']);
  assert.ok(choices.ph_02.evidence.every(e=>e.kind==='uploaded_photo'&&e.note.length>0));
  assert.match(choices.ph_02.evidence[0].note,new RegExp(String(distance)));
  assert.equal(feed.omit_summary.recommended_count,1);
  assert.match(feed.omit_summary.message,/화면 배치가 거의 같게 관측된 1장/);
});

test('the threshold is a boundary, not a suggestion: just past it nothing is recommended',async()=>{
  // 한 칸만 벌려 거리를 정확히 통제한다: RMS 거리 = |delta| 이므로 기준 바로 아래·위를 만들 수 있다.
  for(const [delta,expected] of [[SIMILAR_DISTANCE-0.01,true],[SIMILAR_DISTANCE,false],[SIMILAR_DISTANCE+0.01,false]]) {
    const list=photos(3,(photo,index)=>{if(index<2) photo.structure_signature=index===0?baseSignature:shifted(delta);});
    const {feed}=await feedOf(list);
    assert.equal(byId(feed).ph_02.recommended,expected,`delta ${delta}`);
    assert.equal(feed.slots.length,3,'E1 은 어느 쪽에서도 깨지지 않는다');
  }
});

test('a byte duplicate keeps its own stronger reason instead of gaining a second one',async()=>{
  const list=photos(3,(photo,index)=>{if(index<2) photo.structure_signature=index===0?baseSignature:shifted(0.001);});
  list[1].quality_flags=[...list[1].quality_flags,'duplicate_of:ph_01'];
  const {feed}=await feedOf(list);
  const choice=byId(feed).ph_02;
  assert.equal(choice.recommended,true);
  assert.match(choice.reason,/동일 바이트 중복/);
  assert.doesNotMatch(choice.reason,/구조 거리/);
  assert.equal(feed.omit_summary.recommended_count,1);
  assert.match(feed.omit_summary.message,/동일 바이트 중복이 관측된 1장/);
});

test('an absent signature is an absent judgement — never a match, in either direction',async()=>{
  for(const missing of [0,1]) {
    const list=photos(3,(photo,index)=>{if(index<2&&index!==missing) photo.structure_signature=baseSignature;});
    const {feed}=await feedOf(list);
    assert.equal(feed.omit_summary.recommended_count,0);
    assert.match(feed.omit_summary.message,/빼기를 권하는 사진은 없습니다/);
  }
});

test('the contract rejects a signature that is not a fixed-length measurement',()=>{
  for(const forged of [baseSignature.slice(0,CELLS-1),[...baseSignature,0],baseSignature.map(()=>Number.NaN),'nope',baseSignature.map((v,i)=>i?v:'x')])
    assert.throws(()=>validatePhoto({...structuredClone(real[0]),structure_signature:forged}),ContractError,String(forged).slice(0,20));
  assert.doesNotThrow(()=>validatePhoto({...structuredClone(real[0]),structure_signature:baseSignature}));
});

test('a forged decision, a forged distance or a swapped signature is rejected against the actual inputs',async()=>{
  const list=photos(3,(photo,index)=>{if(index<2) photo.structure_signature=index===0?baseSignature:shifted(0.01);});
  const result=await feedOf(list);
  validateFeedResponse(result);
  for(const tamper of [
    r=>{r.feed.slots.find(s=>s.photo_id==='ph_01').omit_suggestion.recommended=true;},
    r=>{r.feed.slots.find(s=>s.photo_id==='ph_02').omit_suggestion.reason='ph_01와 화면 배치가 거의 같게 관측되어(구조 거리 0.0001, 기준 0.4 미만) 이 사진은 빼는 것을 권합니다.';},
    r=>{r.feed.slots.find(s=>s.photo_id==='ph_02').omit_suggestion.evidence[0].ref='outside';},
    r=>{r.feed.omit_summary.recommended_count=0;}
  ]) {
    const forged=structuredClone(result);tamper(forged);
    assert.throws(()=>validateFeedResponse(forged),ContractError);
  }
  // 근거를 지우면 판정도 함께 사라져야 한다 — 서명 없는 입력에 권고가 남아 있으면 거부한다.
  const stripped=structuredClone(result);
  stripped.context.photos.forEach(photo=>{delete photo.structure_signature;});
  assert.throws(()=>validateFeedResponse(stripped),ContractError);
});

test('the analyzer measures a signature from real pixels, and the public boundary drops one it did not sign',async()=>{
  resetAnalysisState();
  const bytes=await readFile(new URL('../fixtures/jpeg/gradient_baseline.jpg',import.meta.url));
  const response=await analyze({schema_version:'1.0',session_id:'similar-api',collection:'selected',
    photo_id:'ph_01',input_index:0,file_ref:'gradient.jpg',media_type:'image/jpeg',image_base64:bytes.toString('base64')});
  assert.equal(response.status,200);
  const analyzed=await response.json();
  assert.equal(analyzed.structure_signature.length,CELLS,'실제 픽셀에서 서명을 잰다');
  assert.deepEqual(analyzed.structure_signature,structureSignature(readJpegBlocks(bytes).components[0]));
  // 대비 정규화를 실제로 거쳤는지는 값의 성질로 본다 — 같은 함수로 다시 계산해 맞춰 보는 것은 증거가 아니다.
  // 정규화가 빠지면 서명이 노출을 말하게 되고, 밝기만 다른 같은 장면이 서로 멀어진다.
  const cells=analyzed.structure_signature;
  const mean=cells.reduce((a,v)=>a+v,0)/cells.length;
  assert.ok(Math.abs(mean)<0.01,`정규화된 서명의 평균은 0 이어야 한다: ${mean}`);
  assert.ok(Math.abs(Math.sqrt(cells.reduce((a,v)=>a+(v-mean)**2,0)/cells.length)-1)<0.01,'표준편차는 1 이어야 한다');
  validatePhoto(analyzed);

  const kept=authenticateDuplicateFlags([analyzed],{collection:'selected',sessionId:'similar-api',secret:SECRET});
  assert.deepEqual(kept[0].structure_signature,analyzed.structure_signature,'서명이 그대로면 남는다');
  const swapped=authenticateDuplicateFlags([{...analyzed,structure_signature:baseSignature}],{collection:'selected',sessionId:'similar-api',secret:SECRET});
  assert.equal(swapped[0].structure_signature,undefined,'영수증이 서명하지 않은 값은 지운다');
  const unsigned=authenticateDuplicateFlags([analyzed],{collection:'selected',sessionId:'similar-api',secret:undefined});
  assert.equal(unsigned[0].structure_signature,undefined,'비밀값이 없으면 서버가 잰 값임을 증명할 수 없다');
});

test('a flat card has no structure to observe, so it carries no signature and matches nothing',async()=>{
  const flat={grid:Float64Array.from({length:64},()=>128),bw:8,usedW:8,usedH:8};
  assert.equal(structureSignature(flat),null);
  const card=await readFile(new URL('../eval/golden/case_01/photos/ph_01.svg',import.meta.url)).catch(()=>null);
  if(card) assert.equal(measureJpeg(card),null,'SVG 카드는 JPEG 측정 경로를 타지 않는다');
});

test('recomputation is what validates the extension, so a suggestion never outlives its evidence',async()=>{
  const list=photos(3,(photo,index)=>{if(index<2) photo.structure_signature=index===0?baseSignature:shifted(0.01);});
  const {feed}=await feedOf(list);
  const recomputed=withOmitSuggestions(feed,list);
  assert.deepEqual(byId(recomputed),byId(feed));
  const widened=structuredClone(list);
  widened[1].structure_signature=shifted(SIMILAR_DISTANCE+0.1);
  assert.equal(withOmitSuggestions(feed,widened).omit_summary.recommended_count,0);
});
