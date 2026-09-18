import { readFile } from 'node:fs/promises';
import { ContractError, sameStructure } from './contracts.js';
import { OMISSION_RULE, RequestError, validateGenerateRequest, validateGenerateResponse } from './interaction.js';
import { ModelError, OUTPUT_MODEL, requestStructuredModel } from './model.js';
import { measuredColorOverlap } from './order.js';
import { extractFromFreetext } from './target_profile.js';
import { readJsonRequest } from './upload.js';

const objectSchema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = {type:'string'};
const evidence = objectSchema({kind:{type:'string',enum:['ig_post','uploaded_photo','user_text','aggregate','rule']},ref:string,note:string});
const slot = objectSchema({position:{type:'integer'},photo_id:string,caption_state:{type:'string',enum:['filled','omitted']},text:{type:['string','null']},omit_reason:{type:['string','null']},evidence:{type:'array',items:evidence}});
const schemas = {all:objectSchema({output:objectSchema({title:string,slots:{type:'array',items:slot}})}),slot:objectSchema({slot})};
const promptFiles = ['shared/style_guard.md','output/title.md','output/caption.md','output/omit_reason.md'];
const OMIT_OVERLAP_MIN = 0.9;

const validateCanonicalCoverage = input => {
  const target=input.context.target;
  if(target.kind==='photo_plan' || target.source!=='freetext') return;
  const canonical=extractFromFreetext(target.raw_freetext,{profileId:target.profile_id,createdAt:target.created_at});
  if(!sameStructure(target.language?.caption_coverage,canonical.language?.caption_coverage)) {
    throw new ContractError('context.target.language.caption_coverage','differs from canonical freetext extraction');
  }
};

const stabilizeOmission = (observation, input) => {
  if (input.mode!=='all' || observation.output.slots.some(slot=>slot.caption_state!=='filled')) return observation;
  const appliedLanguage=input.feed.applied_profile.language;
  const target=input.context.target;
  const targetLanguage=target.kind==='photo_plan'?null:target.language;
  const coverage=targetLanguage?.caption_coverage?.value;
  const ratios=[targetLanguage?.empty_caption_ratio?.value,
    ...(input.feed.applied_profile.disclosure==='corrected'?[input.context.current.language?.empty_caption_ratio?.value]:[])]
    .filter(value=>value!==undefined);
  if (!appliedLanguage || coverage==='all') return observation;
  if (coverage!=='sparse' && (target.source==='freetext'
    || targetLanguage?.caption_len?.value?.p50>=90 || appliedLanguage.caption_len?.value?.p50>=90
    || ratios.includes(0) || !ratios.some(value=>value>0) || Math.max(...ratios)*input.feed.slots.length<1)) return observation;
  const slotsByPosition=new Map(input.feed.slots.map(slot=>[slot.position,slot]));
  const photosById=new Map(input.context.photos.map(photo=>[photo.photo_id,photo]));
  const candidate=input.feed.slots.filter(slot=>slot.position>1).map(slot=>{
    const previous=slotsByPosition.get(slot.position-1);
    return {slot,overlap:measuredColorOverlap(photosById.get(previous.photo_id),photosById.get(slot.photo_id))};
  }).filter(({slot,overlap})=>slot.caption_inputs.adjacent_overlap===overlap)
    .sort((a,b)=>b.overlap-a.overlap || a.slot.position-b.slot.position)[0];
  if (!candidate || candidate.overlap<OMIT_OVERLAP_MIN) return observation;
  const rules=[{
    kind:'rule', ref:'gyeol.omit.overlap',
    note:`검증한 adjacent_overlap=${candidate.overlap}인 피드 내 최댓값을 비움 안정화 규칙으로 선택했다`
  }];
  return {output:{...observation.output,slots:observation.output.slots.map(slot=>slot.photo_id===candidate.slot.photo_id?{
    ...slot, caption_state:'omitted', text:null,
    omit_reason:'앞 사진과의 겹침 신호가 피드 안에서 가장 높아, 사진만 두는 흐름을 제안했어요.',
    evidence:[...slot.evidence,...rules]
  }:slot)}};
};

// 비움이 0개인 것도 판단의 결과다. 개수를 조작하지 않고, 최종 결과를 세어 그 사실만 응답에 적는다 (#80).
const discloseOmission = output => {
  const total=output.slots.length;
  const omitted=output.slots.filter(slot=>slot.caption_state==='omitted').length;
  return {
    omitted, total,
    note_key: omitted===0?'omission.none':'omission.some',
    note: omitted===0
      ? `이번에는 ${total}자리 모두에 문장을 두는 편이 낫다고 봤어요.`
      : `${total}자리 중 ${omitted}자리는 사진만 두는 편이 낫다고 봤어요.`,
    evidence: [{kind:'rule',ref:OMISSION_RULE,note:`생성 결과의 omitted 슬롯을 세어 ${omitted}/${total}로 적었다`}]
  };
};

export async function generateOutput(input, {
  apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.GYEOL_OUTPUT_MODEL || OUTPUT_MODEL,
  fetchImpl = globalThis.fetch, timeoutMs = 45_000
} = {}) {
  validateGenerateRequest(input);
  validateCanonicalCoverage(input);
  if (!apiKey?.trim()) throw new RequestError('GENERATION_UNAVAILABLE',503,'문장 생성이 아직 연결되지 않았어요. 나중에 다시 시도해 주세요.');
  const prompt = (await Promise.all(promptFiles.map(file => readFile(new URL('../prompts/'+file,import.meta.url),'utf8')))).join('\n\n');
  const slots = input.mode==='slot' ? input.feed.slots.filter(slot=>slot.photo_id===input.photo_id) : input.feed.slots;
  const appliedProfile=input.feed.applied_profile.disclosure==='target_only'
    ? {...input.feed.applied_profile,current_profile_id:null}:input.feed.applied_profile;
  const result = await requestStructuredModel({apiKey,model,fetchImpl,timeoutMs,maxTokens:8192,prompt,schema:schemas[input.mode],content:[{type:'text',text:JSON.stringify({mode:input.mode,applied_profile:appliedProfile,slots})}]});
  let observation;
  try {
    validateGenerateResponse(result.observation,input);
    const outputSlots=input.mode==='all'?result.observation.output.slots:[result.observation.slot];
    for (const slot of outputSlots) if (!slot.evidence.some(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id)) throw new Error('Missing own photo evidence');
    observation=stabilizeOmission(result.observation,input);
    if (input.mode==='all') observation={output:observation.output,omission:discloseOmission(observation.output)};
    validateGenerateResponse(observation,input);
  } catch { throw new ModelError('MODEL_CONTRACT','Model output does not match the requested photo contract.'); }
  return observation;
}

export async function handleGenerate(request, options) {
  const headers={'Cache-Control':'no-store'};
  const fail=(status,code,message,retryable=false)=>Response.json({error:{code,message,retryable}},{status,headers});
  if(request.method!=='POST') { headers.Allow='POST'; return fail(405,'METHOD_NOT_ALLOWED','POST 요청으로 보내 주세요.'); }
  try {
    const input=await readJsonRequest(request);
    return Response.json(await generateOutput(input,options),{headers});
  } catch (error) {
    if(error instanceof RequestError) return fail(error.status,error.code,error.message,error.retryable);
    if(error instanceof ContractError) return fail(400,'INVALID_REQUEST','사진과 생성 요청 내용을 확인해 주세요.');
    if(error instanceof ModelError) {
      const timeout=error.code==='MODEL_TIMEOUT';
      const unavailable=error.code==='MODEL_UNAVAILABLE' || error.code==='MODEL_KEY_MISSING';
      const retryable=timeout || ['MODEL_NETWORK','MODEL_JSON','MODEL_CONTRACT','MODEL_INCOMPLETE'].includes(error.code)
        || (error.code==='MODEL_HTTP' && (error.status===429 || error.status>=500));
      return fail(timeout?504:unavailable?503:502,error.code,timeout?'응답이 늦어지고 있어요. 다시 시도해 주세요.':'문장을 만들지 못했어요. 입력을 확인하거나 나중에 다시 시도해 주세요.',retryable);
    }
    return fail(500,'INTERNAL_ERROR','문장을 준비하지 못했어요. 나중에 다시 시도해 주세요.',true);
  }
}
