import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { validateEditedExport, validateExport } from '../lib/contracts.js';
import { composeProfile } from '../lib/compose.js';
import { buildCurrentProfile } from '../lib/current_profile.js';
import { validateContext, validateErrorResponse, validateFeedResponse, validateGenerateRequest, validateGenerateResponse, validateIdentity, validateOrderRequest, MAX_UPLOAD_BYTES } from '../lib/interaction.js';
import { readJsonRequest, validateUpload } from '../lib/upload.js';
const fixture=JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const ids=fixture.context.photos.map(p=>p.photo_id);
const clone=value=>structuredClone(value);
const generate=(mode='all')=>({schema_version:'1.0',mode,feed:clone(fixture.feed),context:clone(fixture.context),...(mode==='slot'?{photo_id:ids[0]}:{})});

test('contract fixtures cover identities, photo-only, corrected, three states and all omitted',()=>{
  fixture.identities.forEach(validateIdentity);fixture.errors.forEach(validateErrorResponse);
  for(const value of [fixture,fixture.photo_only,fixture.corrected]) validateFeedResponse({feed:value.feed,context:value.context});
  validateExport(fixture.output,fixture.feed,ids);validateExport(fixture.all_omitted,fixture.feed,ids);
  validateEditedExport(fixture.edited,fixture.feed,ids);
  assert.throws(()=>validateExport(fixture.edited,fixture.feed,ids),/identity differs/);
});

test('request boundaries reject foreign IDs, bad versions, false photo targets and mixed identities',()=>{
  const order={schema_version:'1.0',session_id:'session_test',photos:fixture.context.photos,identity:fixture.identities[0]};
  validateOrderRequest(order);
  for(const photos of [order.photos.slice(0,2),Array(21).fill(order.photos[0]),[order.photos[0],order.photos[0],order.photos[2]]]) assert.throws(()=>validateOrderRequest({...order,photos}));
  assert.throws(()=>validateIdentity({target:{kind:'reference',url:'javascript:alert(1)'},current:{kind:'none'}}));
  assert.throws(()=>validateIdentity({target:{kind:'text',text:'  '},current:{kind:'none'}}));
  for(const patch of [{schema_version:'2.0'},{mode:'unknown'},{photo_id:'foreign'}]) assert.throws(()=>validateGenerateRequest({...generate(),...patch}));
  const target=clone(fixture);target.feed.schema_version='1.1';assert.throws(()=>validateFeedResponse({feed:target.feed,context:target.context}),/1.0/);
  const photo=clone(fixture.photo_only);photo.feed.schema_version='1.0';assert.throws(()=>validateFeedResponse(photo),/1.1/);
  photo.feed.schema_version='1.1';photo.feed.applied_profile.target_profile_id='invented';assert.throws(()=>validateFeedResponse(photo),/photo plan/);
  const coverage=clone(fixture);
  const claim={value:'sparse',confidence:0.8,evidence:[{kind:'user_text',ref:`${coverage.context.target.profile_id}:raw`,note:'explicit coverage'}]};
  coverage.context.target.language.caption_coverage=claim;
  coverage.context.target.completeness.language=0.4;
  coverage.feed.applied_profile.language.caption_coverage={evidence:clone(claim.evidence),confidence:claim.confidence,value:claim.value};
  validateFeedResponse({feed:coverage.feed,context:coverage.context});
  coverage.feed.applied_profile.language.caption_coverage.value='all';
  assert.throws(()=>validateFeedResponse({feed:coverage.feed,context:coverage.context}),/caption coverage differs/);
  const draft=clone(fixture.edited);draft.slots[0].photo_id='foreign';assert.throws(()=>validateEditedExport(draft,fixture.feed,ids));
});

test('generation all and single-slot responses keep the requested original photo and position',()=>{
  const all=generate();validateGenerateRequest(all);
  const output=clone(fixture.output);output.slots[2]={...output.slots[2],caption_state:'seed',text:'단색 카드',evidence:[{kind:'uploaded_photo',ref:ids[2],note:'합성 카드'}]};
  validateGenerateResponse({output},all);
  assert.throws(()=>validateGenerateResponse({output:fixture.output},all),/user edit/);
  const request=generate('slot');validateGenerateRequest(request);
  validateGenerateResponse({slot:fixture.output.slots[0]},request);
  assert.throws(()=>validateGenerateResponse({slot:fixture.output.slots[1]},request),/wrong requested/);
  assert.throws(()=>validateGenerateResponse({slot:{...fixture.output.slots[0],position:2}},request));
});

test('current post evidence resolves to a separate supplied photo set',()=>{
  const photos=[{...fixture.context.photos[0],photo_id:'current_photo',input_index:0}];
  const context={...clone(fixture.context),current_photos:photos,current:buildCurrentProfile({photos,captions:['기존 기록']})};
  validateContext(context);
  const feed=clone(fixture.feed);feed.applied_profile=composeProfile({currentProfile:context.current,targetProfile:context.target});
  validateFeedResponse({feed,context});
  feed.slots[0].rationale.evidence=[{kind:'uploaded_photo',ref:'current_photo',note:'기존 게시물은 새 사진 순서의 근거가 아니다'}];
  assert.throws(()=>validateFeedResponse({feed,context}),/does not resolve/);
  assert.throws(()=>validateContext({...context,current_photos:[]}));
  context.current.visual.palette.evidence[0].ref=ids[0];assert.throws(()=>validateContext(context),/does not resolve/);
});

test('actual JPEG/PNG/WebP metadata, MIME and byte/dimension limits are checked',async()=>{
  const body={schema_version:'1.0',session_id:'upload-session',collection:'selected',photo_id:'upload_test',input_index:0,file_ref:'test',media_type:'image/jpeg',image_base64:''};
  for(const format of ['jpeg','png','webp']) {
    const bytes=await sharp({create:{width:8,height:6,channels:3,background:'#ffffff'}}).toFormat(format).toBuffer();
    const request={...body,media_type:`image/${format}`,image_base64:bytes.toString('base64')};
    assert.equal((await validateUpload(request)).bytes.length,bytes.length);
    await assert.rejects(validateUpload({...request,media_type:format==='png'?'image/jpeg':'image/png'}),{code:'UNSUPPORTED_MEDIA_TYPE'});
    for (const missing of [['session_id'],['collection'],['session_id','collection']]) {
      const invalid={...request};missing.forEach(key=>delete invalid[key]);
      await assert.rejects(validateUpload(invalid),{code:'INVALID_REQUEST'});
    }
  }
  await assert.rejects(validateUpload({...body,media_type:'image/svg+xml'}),{code:'UNSUPPORTED_MEDIA_TYPE'});
  await assert.rejects(validateUpload({...body,image_base64:'bm90LWFuLWltYWdl'}),{code:'INVALID_IMAGE'});
  await assert.rejects(validateUpload({...body,image_base64:Buffer.alloc(MAX_UPLOAD_BYTES+1).toString('base64')}),{code:'IMAGE_TOO_LARGE'});
  const wide=await sharp({create:{width:8193,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
  await assert.rejects(validateUpload({...body,media_type:'image/png',image_base64:wide.toString('base64')}),{code:'IMAGE_DIMENSIONS'});
});

test('JSON byte limit applies without Content-Length; invalid JSON/errors never become success',async()=>{
  const request=text=>new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:text});
  assert.deepEqual(await readJsonRequest(request('{"ok":true}')),{ok:true});
  await assert.rejects(readJsonRequest(request('{invalid')),{code:'INVALID_REQUEST'});
  await assert.rejects(readJsonRequest(request(' '.repeat(40)),20),{code:'REQUEST_TOO_LARGE'});
  assert.throws(()=>validateErrorResponse({error:{code:'MODEL_TIMEOUT',message:'다시 시도',retryable:'true'}}));
  assert.throws(()=>validateErrorResponse({output:null}));
});
