// #97 A — 화면 배치가 거의 같게 관측된 사진에만 빼기를 권한다. 자동 제외는 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import sharp from 'sharp';
import {buildFeed,handleLegacyFeed as handleFeed,handleAnalyze} from '../lib/pipeline.js';
import {validateFeedResponse} from '../lib/interaction.js';
import {resetAnalysisState,measureJpeg} from '../lib/photo_analysis.js';
import {SIMILAR_DISTANCE,withOmitSuggestions} from '../lib/omit-suggestion.js';
import {SIGNATURE_SIDE,exifOrientation,orientSignature,signatureDistance,structureSignature} from '../lib/photo_signature.js';
import {validatePhoto,ContractError} from '../lib/contracts.js';
import {authenticateDuplicateFlags,createPhotoReceipt,readPhotoReceipt} from '../lib/photo-receipt.js';
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

// ── #182 리뷰 Major 1: 제외 후보가 다시 비교 원본이 되면 연쇄 권고가 서로 모순된다 ──────────────
test('an omitted photo is not a comparison original, so a chain never recommends away its own evidence',async()=>{
  // A-B, B-C 는 기준 미만이고 A-C 는 기준 밖인 세 벌. 리뷰가 재현한 그 배치다.
  const wave=t=>Array.from({length:CELLS},(_,i)=>{
    const a=(2*Math.PI*i)/CELLS;
    return Number((Math.sin(a)*Math.cos(t)+Math.cos(a)*Math.sin(t)).toFixed(3));
  });
  const [a,b,c]=[wave(0),wave(0.35),wave(0.70)];
  assert.ok(signatureDistance(a,b)<SIMILAR_DISTANCE && signatureDistance(b,c)<SIMILAR_DISTANCE,'연쇄 전제');
  assert.ok(signatureDistance(a,c)>=SIMILAR_DISTANCE,'양 끝은 기준 밖이어야 이 검사가 의미를 갖는다');
  const list=photos(3,(photo,index)=>{photo.structure_signature=[a,b,c][index];});
  const {feed}=await feedOf(list);
  const choices=byId(feed);
  assert.equal(choices.ph_01.recommended,false,'첫 장은 남는다');
  assert.equal(choices.ph_02.recommended,true,'남은 ph_01 과 가까우므로 뺄 후보다');
  assert.equal(choices.ph_03.recommended,false,'뺄 후보인 ph_02 는 비교 원본이 아니고, 남는 ph_01 과는 기준 밖이다');
  // 모순 부재: 권고된 사진은 어떤 권고의 근거로도 등장하지 않는다.
  const omitted=new Set(feed.slots.filter(s=>s.omit_suggestion.recommended).map(s=>s.photo_id));
  for(const slot of feed.slots) for(const item of slot.omit_suggestion.evidence)
    if(item.ref!==slot.photo_id) assert.ok(!omitted.has(item.ref),`빼라고 한 ${item.ref} 를 남기라는 근거로 쓰고 있다`);
});

test('a byte duplicate is omitted too, so it cannot become the original a similar photo points at',async()=>{
  const near=delta=>baseSignature.map(v=>Number((v+delta).toFixed(3)));
  // ph_02 는 ph_01 의 동일 바이트 중복이라 빠진다. ph_03 은 ph_02 와만 가깝고 ph_01 과는 기준 밖이다.
  const list=photos(3,(photo,index)=>{
    photo.structure_signature=[baseSignature,near(0.5),near(0.51)][index];
    if(index===1) photo.quality_flags=[...photo.quality_flags,'duplicate_of:ph_01'];
  });
  assert.ok(signatureDistance(list[0].structure_signature,list[2].structure_signature)>=SIMILAR_DISTANCE,'양 끝은 기준 밖');
  assert.ok(signatureDistance(list[1].structure_signature,list[2].structure_signature)<SIMILAR_DISTANCE,'연쇄 전제');
  const choices=byId((await feedOf(list)).feed);
  assert.equal(choices.ph_02.recommended,true,'동일 바이트 중복은 그대로 뺄 후보다');
  assert.ok(choices.ph_02.reason.includes('동일 바이트 중복'));
  assert.equal(choices.ph_03.recommended,false,'빠지는 ph_02 를 남기라는 근거로 삼지 않는다');
});

// ── #182 리뷰 Major 2: 서명은 저장 픽셀이 아니라 화면에 보이는 방향으로 잰다 ────────────────────
test('the signature follows the displayed orientation, so EXIF rotation and a re-encoded rotation agree',async()=>{
  // 좌우·상하 어느 쪽으로도 대칭이 아닌 그라디언트. 대칭 사진은 방향을 바꿔도 서명이 같아서
  // 이 검사가 통과해도 아무것도 증명하지 못한다.
  const W=128,H=96,raw=Buffer.alloc(W*H*3);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
    const i=(y*W+x)*3,v=Math.round(20+200*(x/W)**2+30*Math.sin((6*y)/H));
    raw[i]=v; raw[i+1]=Math.round(v*0.6+40*(y/H)); raw[i+2]=255-v;
  }
  const source=await sharp(raw,{raw:{width:W,height:H,channels:3}}).jpeg({quality:95}).toBuffer();
  const upright=measureJpeg(source).structure_signature;
  assert.ok(upright,'기준 사진에 구조가 있어야 이 검사가 의미를 갖는다');
  for(const orientation of [1,2,3,4,5,6,7,8]) {
    // 같은 저장 픽셀 + EXIF 방향만 다른 파일 vs 그 파일의 픽셀을 실제로 돌린 재인코딩본.
    // 두 번에 나눠 쓴다 — rotate() 는 같은 파이프라인에서 쓰는 metadata 가 아니라 입력의 EXIF 를 읽는다.
    const tagged=await sharp(source).withMetadata({orientation}).toBuffer();
    const rotated=await sharp(tagged).rotate().withMetadata({orientation:1}).jpeg({quality:95}).toBuffer();
    assert.equal(exifOrientation(tagged),orientation,`EXIF Orientation ${orientation} 을 읽어야 한다`);
    assert.equal(exifOrientation(rotated),1,'물리 회전본에는 방향 태그가 남지 않는다');
    const a=measureJpeg(tagged).structure_signature,b=measureJpeg(rotated).structure_signature;
    assert.ok(a&&b,`방향 ${orientation}: 양쪽 다 서명이 나와야 한다`);
    // 남는 차이는 재인코딩·리샘플링 오차뿐이다. 방향을 무시하면 여기서 1 이상으로 벌어진다.
    assert.ok(signatureDistance(a,b)<SIMILAR_DISTANCE,
      `방향 ${orientation}: 같은 화면 배치인데 거리가 ${signatureDistance(a,b)} 다`);
    // 반대 방향의 미탐도 막는다 — 돌려서 다르게 보이는 사진은 실제로 멀어야 한다.
    if([2,3,5,6,7,8].includes(orientation)) assert.ok(signatureDistance(a,upright)>=SIMILAR_DISTANCE,
      `방향 ${orientation}: 화면에서 다르게 보이는데 거리가 ${signatureDistance(a,upright)} 다`);
  }
});

test('orientSignature only moves cells, and an unknown orientation changes nothing',()=>{
  const cells=Array.from({length:CELLS},(_,i)=>i);
  for(const orientation of [2,3,4,5,6,7,8])
    assert.deepEqual([...orientSignature(cells,orientation)].sort((x,y)=>x-y),cells,'값은 보존되고 자리만 바뀐다');
  assert.deepEqual(orientSignature(cells,1),cells);
  assert.deepEqual(orientSignature(cells,99),cells,'읽을 수 없는 방향은 회전하지 않는다');
  assert.equal(exifOrientation(Buffer.from('not a jpeg')),1);
});

// ── #182 리뷰 Major 3: v1 영수증/구 분석은 바이트 중복까지만 신뢰하고 서명은 지운다 ──────────────
test('a v1 receipt keeps its byte-duplicate observation and loses only the signature it never signed',()=>{
  const v1=(photo,digest)=>{
    const body=Buffer.from(JSON.stringify({v:1,sessionId:'mixed',collection:'selected',digest,
      photoId:photo.photo_id,inputIndex:photo.input_index})).toString('base64url');
    return `${body}.${createHmac('sha256',SECRET).update(body).digest('base64url')}`;
  };
  const digest='a'.repeat(64);
  const list=photos(3,(photo,index)=>{
    photo.structure_signature=index===0?baseSignature:shifted(0.01);
    photo.analysis_receipt=v1(photo,index<2?digest:'b'.repeat(64));
  });
  const authenticated=authenticateDuplicateFlags(list,{collection:'selected',sessionId:'mixed',secret:SECRET});
  assert.ok(authenticated[1].quality_flags.includes('duplicate_of:ph_01'),
    'v1 영수증을 전부 거절하면 기존 동일 바이트 중복 권고가 조용히 사라진다');
  assert.ok(authenticated.every(photo=>photo.structure_signature===undefined),
    'v1 은 서명을 서명하지 않았으므로 유사 판정 근거로 쓰지 않는다 (fail closed)');
  const bare={slots:authenticated.map((photo,index)=>({position:index+1,photo_id:photo.photo_id}))};
  const choices=byId(withOmitSuggestions(bare,authenticated));
  assert.equal(choices.ph_02.recommended,true,'바이트 중복 권고는 유지된다');
  assert.ok(choices.ph_02.reason.includes('동일 바이트 중복'));
  assert.equal(choices.ph_03.recommended,false,'서명이 없으므로 유사 권고는 나오지 않는다');
});

test('a v2 receipt still authenticates the signature, and a forged version field is rejected',()=>{
  const forge=payload=>{
    const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256',SECRET).update(body).digest('base64url')}`;
  };
  const base={sessionId:'mixed',collection:'selected',digest:'c'.repeat(64),photoId:'ph_01',inputIndex:0};
  assert.equal(readPhotoReceipt(forge({v:3,...base,sigDigest:null}),SECRET),null,'모르는 버전은 읽지 않는다');
  assert.equal(readPhotoReceipt(forge({v:1,...base,sigDigest:null}),SECRET),null,'v1 에 v2 키를 섞으면 거부한다');
  assert.equal(readPhotoReceipt(forge({v:2,...base}),SECRET),null,'v2 에서 sigDigest 를 빼면 거부한다');
  assert.equal(readPhotoReceipt(forge({v:1,...base}),SECRET).v,1);
});

test('the optional-field contract fixture is a real measurement that validates on its own',async()=>{
  const [photo]=JSON.parse(await readFile(new URL('../fixtures/photo_analysis.signature.sample.json',import.meta.url),'utf8'));
  validatePhoto(photo);
  assert.equal(photo.structure_signature.length,CELLS);
  const bytes=await readFile(new URL('../fixtures/jpeg/gradient_baseline.jpg',import.meta.url));
  assert.deepEqual(photo.structure_signature,measureJpeg(bytes).structure_signature,
    'fixture 는 손으로 채운 값이 아니라 그 사진을 실제로 잰 값이다');
});
