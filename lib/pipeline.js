import {bundleConcept,placementVoice} from './curation-voice.js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ContractError} from './contracts.js';
import {buildCurrentProfile} from './current_profile.js';
import {composeFeed} from './compose.js';
import {RequestError,validateFeedResponse,validateOrderRequest} from './interaction.js';
import {analyzePhoto,AnalysisUnavailableError} from './photo_analysis.js';
import {ModelError} from './model.js';
import {extractFromFreetext,extractFromReference,planFromPhotos,referenceHandle,UnsupportedReferenceError} from './target_profile.js';
import {readJsonRequest,readUploadRequest} from './upload.js';
import {withOmitSuggestions} from './omit-suggestion.js';
import {hasOrderingBasis,TIE_BAND} from './order.js';
import {authenticateDuplicateFlags,createPhotoReceipt} from './photo-receipt.js';
import {buildCuration} from './curation.js';

const headers={'Cache-Control':'no-store'};
function failure(error) {
  let status=500,code='INTERNAL_ERROR',message='요청을 처리하지 못했어요. 다시 시도해 주세요.',retryable=true,retryAfter;
  if(error instanceof RequestError) ({status,code,message,retryable,retryAfter}=error);
  else if(error instanceof ContractError) {status=400;code='INVALID_REQUEST';message='사진과 입력 내용을 확인해 주세요.';retryable=false;}
  else if(error instanceof UnsupportedReferenceError) {status=422;code='REFERENCE_NOT_PREPARED';message='준비된 계정이 아니에요. URL을 비우고 사진이나 원하는 느낌으로 시작해 주세요.';retryable=false;}
  else if(error instanceof AnalysisUnavailableError) {status=422;code='INVALID_IMAGE';message='사진을 읽지 못했어요. 다른 JPEG 사진으로 시도해 주세요.';retryable=false;}
  else if(error instanceof ModelError || error.code?.startsWith('MODEL_')) {status=error.code==='MODEL_TIMEOUT'?504:502;code=error.code;message='사진 분석을 마치지 못했어요. 잠시 후 다시 시도해 주세요.';retryable=error.code!=='MODEL_HTTP'||error.status===429||error.status>=500;}
  return Response.json({error:{code,message,retryable}},{status,headers:{...headers,...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
}

export async function handleAnalyze(request,{receiptSecret=process.env.GYEOL_ANALYSIS_RECEIPT_SECRET,beforeProvider}={}) {
  if(request.method!=='POST')return Response.json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청으로 보내 주세요.',retryable:false}},{status:405,headers:{...headers,Allow:'POST'}});
  try {
    const url=new URL(request.url);
    if(url.searchParams.has('mock') && (url.searchParams.getAll('mock').length!==1 || url.searchParams.get('mock')!=='1')) throw new RequestError('INVALID_REQUEST',400,'분석 모드를 확인해 주세요.');
    const upload=await readUploadRequest(request);
    const result=await analyzePhoto({...upload,beforeProvider,...(url.searchParams.get('mock')==='1'?{apiKey:''}:{})});
    const analysis_receipt=createPhotoReceipt({analysis:result.analysis,collection:upload.collection,digest:result.digest,sessionId:upload.sessionId},receiptSecret);
    const analysis=analysis_receipt?{...result.analysis,analysis_receipt}:result.analysis;
    return Response.json(analysis,{headers:{...headers,'X-Gyeol-Analysis-Source':result.execution.source,'X-Gyeol-Analysis-Reason':result.execution.reason,'X-Gyeol-Analysis-Cache':result.execution.cache_hit?'hit':'miss'}});
  } catch(error) { return failure(error); }
}

// 측정된 차이가 없는 묶음의 갈래다. 조건이 #69 와 다르다 — 그때는 "지향이 없으면" 이었고 이제는
// "관측된 차이가 없으면" 이다. #69 가 적어 둔 두 이유를 각각 판정했다 (docs/specs/127-photo-only-ordering/intent.md):
//  1) 구조: orderFeed 가 validateProfile(target,'target') 을 불러 PhotoPlan 이 통과하지 못하던 것은 맞다.
//     그러나 계약(validateFeed · validateTargetAxis · validateContext)은 이미 photo_plan 축을 1급으로 다루므로
//     그 한 줄을 축 종류에 따라 갈라 부르면 끝난다. schemas/ 4종은 건드리지 않았다.
//  2) 제품: 방향 점수를 쓰는 것은 R1 뿐이고 R2·R3·R4 는 지향을 읽지 않는다. 그 세 규칙의 입력은 업로드한
//     사진에서 실제 관측된 밝기·채도·색상각이다. 즉 지향이 없어도 순서를 정할 근거는 사진 자체에 있다.
// 남은 진짜 제약은 하나다: 세 축 전부가 TIE_BAND 안인 묶음은 값이 사진을 가르지 못한 것이고, 그때 자리를
// 바꾸면 근거를 댈 수 없다. 그 경우에만 입력 순서를 유지하고 "차이가 관측되지 않았다"고 말한다.
function preserveOrder(photos, current, target, sessionId) {
  const applied={target_profile_id:null,photo_plan_id:target.plan_id,current_profile_id:current.profile_id,corrected:false,disclosure:'target_only',deltas:[],visual:target.visual,language:null,sequence:target.sequence};
  const slots=photos.map((photo,index)=>{
    const facts=photo.describable_facts;
    const previous=new Set(photos[index-1]?.describable_facts??[]);
    const role=index===0?'opener':index===photos.length-1?'closer':'sustain';
    const voice=placementVoice(photo,photos[index-1],role,photos[index+1],{position:index+1,count:photos.length});
    return {photo_id:photo.photo_id,position:index+1,narrative_role:role,
      rationale:{value:`올린 사진들의 밝기와 색이 서로 거의 같아 순서를 바꿀 근거가 없어요. 올린 순서를 그대로 두었어요. ${voice.value}`,confidence:1,evidence:[...voice.evidence,{kind:'rule',ref:'order.no_measured_difference',note:`묶음의 밝기 범위·채도 범위·최대 색 거리가 모두 R1 동점 밴드(${TIE_BAND}) 안이라 측정값이 사진들을 가르지 못했다. 가르지 못한 값으로 자리를 바꾸지 않는다`}]},
      caption_inputs:{describable_facts:[...facts],adjacent_overlap:facts.length?facts.filter(f=>previous.has(f)).length/facts.length:0,is_visual_peak:false}};
  });
  // 묶음 컨셉은 피드 단위 판단이다 (lib/order.js 와 같은 이유). 미달이면 필드를 생략한다.
  const concept=bundleConcept(photos);
  return {schema_version:'1.1',feed_id:'fd_'+randomUUID(),session_id:sessionId,applied_profile:applied,...(concept?{concept}:{}),slots,invariants:{input_count:photos.length,output_count:slots.length,unique_photo_ids:true},generated_at:new Date().toISOString()};
}

export async function buildFeed(input) {
  validateOrderRequest(input);
  const {photos,identity}=input;
  const target=identity.target.kind==='none'?planFromPhotos(photos):identity.target.kind==='text'?extractFromFreetext(identity.target.text):await extractFromReference(identity.target.url);
  let current;
  if(identity.current.kind==='posts') current=buildCurrentProfile({photos:identity.current.photos,...(identity.current.captions?{captions:identity.current.captions}:{})});
  else if(identity.current.kind==='reference') {
    const snapshot=JSON.parse(await readFile(new URL('../fixtures/ig_snapshot.json',import.meta.url),'utf8'));
    if(referenceHandle(identity.current.url)!==snapshot.provenance.account.toLowerCase()) throw new UnsupportedReferenceError(identity.current.url,[snapshot.provenance.account]);
    current=buildCurrentProfile({snapshot});
  } else current=buildCurrentProfile();
  const current_photos=identity.current.kind==='posts'?identity.current.photos:[];
  // 지향이 있으면 분석 출처와 무관하게 순서를 정한다. 휴리스틱 경로도 밝기·채도·색상각은 실측이고
  // (test/order.real20.json 20장이 전부 analysis_source==='heuristic' 이며 #41 이 그 입력으로 orderFeed 를 검증했다),
  // 관측되지 않은 신호는 orderFeed 안에서 이미 차단된다 — scale 은 source==='vision_model' 일 때만,
  // has_face 는 true 일 때만, 구도는 배치 전체가 모델 관측일 때만(점수·문장 양쪽에서. 혼합 배치의
  // 휴리스틱 composition 은 상수라 관측된 사진과 비교할 수 없다, lib/order.js attributes 위 주석).
  // 사진만 올린 경로도 composeFeed 로 간다 — 순서를 정할 근거(사진에서 관측된 밝기·채도·색 거리)가 있는
  // 한. 없으면 입력 순서를 유지한다. 지향이 있는 경로는 이 게이트를 지나지 않는다.
  const feed=target.kind==='photo_plan' && !hasOrderingBasis(photos)
    ?withOmitSuggestions(preserveOrder(photos,current,target,input.session_id),photos)
    :composeFeed({photoAnalyses:photos,targetProfile:target,currentProfile:current,currentPhotoAnalyses:current_photos,sessionId:input.session_id});
  return validateFeedResponse({feed,context:{photos,current,target,current_photos}});
}
export async function handleLegacyFeed(request,{receiptSecret=process.env.GYEOL_ANALYSIS_RECEIPT_SECRET}={}) {
  try {
    const input=await readJsonRequest(request);
    validateOrderRequest(input);
    input.photos=authenticateDuplicateFlags(input.photos,{collection:'selected',sessionId:input.session_id,secret:receiptSecret});
    if(input.identity?.current?.kind==='posts') input.identity.current.photos=authenticateDuplicateFlags(input.identity.current.photos,{collection:'current',sessionId:input.session_id,secret:receiptSecret});
    return Response.json(await buildFeed(input),{headers});
  }
  catch(error) { return failure(error); }
}

// This is the production POST entry point; no legacy identity fallback is permitted.
export async function handleFeed(request, options = {}) {
  try {
    const input=await readJsonRequest(request);
    return Response.json(await buildCuration(input,options),{headers});
  } catch(error) { return failure(error); }
}
