import {bundleConcept} from './curation-voice.js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ContractError} from './contracts.js';
import {buildCurrentProfile} from './current_profile.js';
import {composeFeed,composeProfile} from './compose.js';
import {RequestError,validateFeedResponse,validateOrderRequest} from './interaction.js';
import {analyzePhoto,AnalysisUnavailableError} from './photo_analysis.js';
import {ModelError} from './model.js';
import {extractFromFreetext,extractFromReference,planFromPhotos,referenceHandle,UnsupportedReferenceError} from './target_profile.js';
import {readJsonRequest,readUploadRequest} from './upload.js';
import {withOmitSuggestions} from './omit-suggestion.js';
import {authenticateDuplicateFlags,createPhotoReceipt} from './photo-receipt.js';

const headers={'Cache-Control':'no-store'};
function failure(error) {
  let status=500,code='INTERNAL_ERROR',message='요청을 처리하지 못했어요. 다시 시도해 주세요.',retryable=true;
  if(error instanceof RequestError) ({status,code,message,retryable}=error);
  else if(error instanceof ContractError) {status=400;code='INVALID_REQUEST';message='사진과 입력 내용을 확인해 주세요.';retryable=false;}
  else if(error instanceof UnsupportedReferenceError) {status=422;code='REFERENCE_NOT_PREPARED';message='준비된 계정이 아니에요. URL을 비우고 사진이나 원하는 느낌으로 시작해 주세요.';retryable=false;}
  else if(error instanceof AnalysisUnavailableError) {status=422;code='INVALID_IMAGE';message='사진을 읽지 못했어요. 다른 JPEG 사진으로 시도해 주세요.';retryable=false;}
  else if(error instanceof ModelError || error.code?.startsWith('MODEL_')) {status=error.code==='MODEL_TIMEOUT'?504:502;code=error.code;message='사진 분석을 마치지 못했어요. 잠시 후 다시 시도해 주세요.';retryable=error.code!=='MODEL_HTTP'||error.status===429||error.status>=500;}
  return Response.json({error:{code,message,retryable}},{status,headers});
}

export async function handleAnalyze(request,{receiptSecret=process.env.GYEOL_ANALYSIS_RECEIPT_SECRET}={}) {
  if(request.method!=='POST')return Response.json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청으로 보내 주세요.',retryable:false}},{status:405,headers:{...headers,Allow:'POST'}});
  try {
    const url=new URL(request.url);
    if(url.searchParams.has('mock') && (url.searchParams.getAll('mock').length!==1 || url.searchParams.get('mock')!=='1')) throw new RequestError('INVALID_REQUEST',400,'분석 모드를 확인해 주세요.');
    const upload=await readUploadRequest(request);
    const result=await analyzePhoto({...upload,...(url.searchParams.get('mock')==='1'?{apiKey:''}:{})});
    const analysis_receipt=createPhotoReceipt({analysis:result.analysis,collection:upload.collection,digest:result.digest,sessionId:upload.sessionId},receiptSecret);
    const analysis=analysis_receipt?{...result.analysis,analysis_receipt}:result.analysis;
    return Response.json(analysis,{headers:{...headers,'X-Gyeol-Analysis-Source':result.execution.source,'X-Gyeol-Analysis-Reason':result.execution.reason,'X-Gyeol-Analysis-Cache':result.execution.cache_hit?'hit':'miss'}});
  } catch(error) { return failure(error); }
}

// 사진만 입력한 경로(identity.target.kind === 'none')의 유일한 갈래다. 지우면 안 된다 — #69 에서 확인한 이유:
//  1) 구조: planFromPhotos 의 산출물은 TargetProfile 이 아니라 photo_plan 이다(kind:'photo_plan' · language:null ·
//     target_profile:null). orderFeed 는 첫머리에서 validateProfile(targetProfile,'target') 을 부르므로 통과하지 못한다.
//     schemas/target_profile.md 가 axis=target 을 source ig_reference|freetext 로만 허용한 결과이지, 미구현이 아니다.
//  2) 제품: 지향이 없으면 resolveDirection 이 'none' 으로 떨어져 방향 신호가 없다. 방향 없이 자리를 바꾸면
//     "왜 이 순서인가"에 답할 수 없다 — 근거 없는 판단은 내지 않는다.
// #41 이 끝나 교체 조건이 해소된 것은 '휴리스틱 분석' 쪽 우회였고, 그것은 #69 에서 제거했다.
function preserveOrder(photos, current, target, sessionId) {
  const isPlan=target.kind==='photo_plan';
  const applied=isPlan?{target_profile_id:null,photo_plan_id:target.plan_id,current_profile_id:current.profile_id,corrected:false,disclosure:'target_only',deltas:[],visual:target.visual,language:null,sequence:target.sequence}:composeProfile({targetProfile:target,currentProfile:current});
  const slots=photos.map((photo,index)=>{
    const facts=photo.describable_facts;
    const previous=new Set(photos[index-1]?.describable_facts??[]);
    return {photo_id:photo.photo_id,position:index+1,narrative_role:index===0?'opener':index===photos.length-1?'closer':'sustain',
      rationale:{value:'선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.',confidence:1,evidence:[{kind:'uploaded_photo',ref:photo.photo_id,note:`선택 순서 ${photo.input_index+1}번`},{kind:'rule',ref:'order.input_order',note:'사진만 입력해 지향이 없으면 방향을 정할 근거가 없으므로 새 순서를 추측하지 않는다'}]},
      caption_inputs:{describable_facts:[...facts],adjacent_overlap:facts.length?facts.filter(f=>previous.has(f)).length/facts.length:0,is_visual_peak:false}};
  });
  // 묶음 컨셉은 피드 단위 판단이다 (lib/order.js 와 같은 이유). 미달이면 필드를 생략한다.
  const concept=bundleConcept(photos);
  return {schema_version:isPlan?'1.1':'1.0',feed_id:'fd_'+randomUUID(),session_id:sessionId,applied_profile:applied,...(concept?{concept}:{}),slots,invariants:{input_count:photos.length,output_count:slots.length,unique_photo_ids:true},generated_at:new Date().toISOString()};
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
  const feed=target.kind==='photo_plan'
    ?withOmitSuggestions(preserveOrder(photos,current,target,input.session_id),photos)
    :composeFeed({photoAnalyses:photos,targetProfile:target,currentProfile:current,currentPhotoAnalyses:current_photos,sessionId:input.session_id});
  return validateFeedResponse({feed,context:{photos,current,target,current_photos}});
}
export async function handleFeed(request,{receiptSecret=process.env.GYEOL_ANALYSIS_RECEIPT_SECRET}={}) {
  try {
    const input=await readJsonRequest(request);
    validateOrderRequest(input);
    input.photos=authenticateDuplicateFlags(input.photos,{collection:'selected',sessionId:input.session_id,secret:receiptSecret});
    if(input.identity?.current?.kind==='posts') input.identity.current.photos=authenticateDuplicateFlags(input.identity.current.photos,{collection:'current',sessionId:input.session_id,secret:receiptSecret});
    return Response.json(await buildFeed(input),{headers});
  }
  catch(error) { return failure(error); }
}
