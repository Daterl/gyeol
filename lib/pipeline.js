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

export async function handleAnalyze(request) {
  if(request.method!=='POST')return Response.json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청으로 보내 주세요.',retryable:false}},{status:405,headers:{...headers,Allow:'POST'}});
  try {
    const url=new URL(request.url);
    if(url.searchParams.has('mock') && (url.searchParams.getAll('mock').length!==1 || url.searchParams.get('mock')!=='1')) throw new RequestError('INVALID_REQUEST',400,'분석 모드를 확인해 주세요.');
    const upload=await readUploadRequest(request);
    const {analysis,execution}=await analyzePhoto({...upload,...(url.searchParams.get('mock')==='1'?{apiKey:''}:{})});
    return Response.json(analysis,{headers:{...headers,'X-Gyeol-Analysis-Source':execution.source,'X-Gyeol-Analysis-Reason':execution.reason,'X-Gyeol-Analysis-Cache':execution.cache_hit?'hit':'miss'}});
  } catch(error) { return failure(error); }
}

// ponytail: keep input order without model observations/target; #41 may replace this after evidence is verified.
function preserveOrder(photos, current, target, sessionId) {
  const isPlan=target.kind==='photo_plan';
  const applied=isPlan?{target_profile_id:null,photo_plan_id:target.plan_id,current_profile_id:current.profile_id,corrected:false,disclosure:'target_only',deltas:[],visual:target.visual,language:null,sequence:target.sequence}:composeProfile({targetProfile:target,currentProfile:current});
  const slots=photos.map((photo,index)=>{
    const facts=photo.describable_facts;
    const previous=new Set(photos[index-1]?.describable_facts??[]);
    return {photo_id:photo.photo_id,position:index+1,narrative_role:index===0?'opener':index===photos.length-1?'closer':'sustain',
      rationale:{value:'선택한 순서를 그대로 두었어요. 취향에 맞춰 다시 정렬한 결과는 아니에요.',confidence:1,evidence:[{kind:'uploaded_photo',ref:photo.photo_id,note:`선택 순서 ${photo.input_index+1}번`},{kind:'rule',ref:'order.input_order',note:'사진 계획 또는 제한된 픽셀 분석에서는 새 순서를 추측하지 않는다'}]},
      caption_inputs:{describable_facts:[...facts],adjacent_overlap:facts.length?facts.filter(f=>previous.has(f)).length/facts.length:0,is_visual_peak:false}};
  });
  return {schema_version:isPlan?'1.1':'1.0',feed_id:'fd_'+randomUUID(),session_id:sessionId,applied_profile:applied,slots,invariants:{input_count:photos.length,output_count:slots.length,unique_photo_ids:true},generated_at:new Date().toISOString()};
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
  const feed=target.kind==='photo_plan'||photos.some(p=>p.analysis_source==='heuristic')
    ?preserveOrder(photos,current,target,input.session_id)
    :composeFeed({photoAnalyses:photos,targetProfile:target,currentProfile:current,currentPhotoAnalyses:current_photos,sessionId:input.session_id});
  return validateFeedResponse({feed,context:{photos,current,target,current_photos}});
}
export async function handleFeed(request) {
  try { return Response.json(await buildFeed(await readJsonRequest(request)),{headers}); }
  catch(error) { return failure(error); }
}
