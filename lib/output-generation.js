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

// 출력 모델은 슬롯 전체가 아니라 이 세 필드만 본다 (#96).
// narrative_role 과 rationale 은 prompts/output/*.md 어디에서도 참조되지 않는데(grep 0건),
// rationale.value 는 '앞자리 사진과 측정 색 거리 0.314 로…' 같은 순서 규칙 문장이라
// 모델이 그것을 "사진 묶음에서 확인한 공통 사실" 로 읽고 제목 소재로 썼다.
// 근거는 사용자가 펼쳐 보는 것이지 제목의 재료가 아니다 — 원본 feed 는 그대로 두고
// 모델에게 복사해 보내는 부분집합만 줄인다. 계약 검증은 계속 원본 input.feed 를 본다.
// caption_inputs 안에서도 수치와 내부 필드명은 넘기지 않는다. 실모델 10회에서 5회,
// 모델은 받은 `adjacent_overlap: 0.786` 을 근거 note 에 그대로 옮겨 적었다 —
// 프롬프트가 그 이름을 부르고 payload 가 그 값을 실어 주는 동안은 계속 그럴 것이다.
// 비움을 제안하는 데 필요한 것은 겹침의 세기이지 측정값이 아니다. 임계는 서버가
// OMIT_OVERLAP_MIN 으로 이미 결정론적으로 적용하므로 새 상수를 만들지 않는다.
// 원본 feed 의 adjacent_overlap·is_visual_peak 는 그대로 남는다 (사용자 근거·계약 검증용).
const forOutput = ({position,photo_id,caption_inputs}) => ({position,photo_id,caption_inputs:{
  describable_facts: caption_inputs.describable_facts,
  앞_사진과_겹침: caption_inputs.adjacent_overlap>=OMIT_OVERLAP_MIN?'높음':'낮음',
  피드_안에서_색이_가장_진함: caption_inputs.is_visual_peak
}});

// applied_profile 도 같은 이유로 줄인다. prompts/output/*.md 가 참조하는 것은
// language(caption_coverage · caption_len) 와 disclosure · corrected · deltas 뿐이고,
// visual 과 sequence 는 grep 0건이다. 그런데 visual.palette.value 는
// {hue_mean, sat_mean, bright_mean} 즉 '밝기 0.712' 의 출처다 —
// 필요 없는 수치는 넘기지 않는 것이 가장 확실한 차단이다 (PR #108 리뷰).
const APPLIED_FIELDS = ['disclosure','corrected','deltas','language','target_profile_id','current_profile_id','photo_plan_id'];
// Claim 의 confidence·evidence 는 출처 추적용이고 출력 프롬프트가 참조하지 않는다.
// confidence 는 0.7 같은 수치라서 모델이 옮겨 적을 수 있는 또 하나의 통로다 — value 만 넘긴다.
const claimValue = value => value!==null && typeof value==='object' && !Array.isArray(value)
  && ['value','confidence','evidence'].every(key=>Object.hasOwn(value,key)) ? value.value : value;
const languageForOutput = language => language===null || language===undefined ? language
  : Object.fromEntries(Object.entries(language).map(([key,value])=>[key,claimValue(value)]));
const appliedForOutput = applied => Object.fromEntries(APPLIED_FIELDS
  .filter(field => Object.hasOwn(applied,field))
  .map(field => [field,
    field==='current_profile_id' && applied.disclosure==='target_only' ? null
    : field==='language' ? languageForOutput(applied.language) : applied[field]]));

// 프롬프트는 확률이고 검증은 보장이다. style_guard 가 금지한 표현을 모델이 한 번이라도
// 어긴 응답은 그대로 사용자 결과가 됐다 — 그 재현이 PR #108 리뷰에서 확인됐다.
// 그래서 출력 경계에서 실패 폐쇄로 닫는다: 아래 표현이 사용자에게 보이는 문장에 있으면 거부한다.
// 판단 기준은 '우리가 자리를 정할 때만 쓰는 말'이다. 같은 표현이 그 사진의
// describable_facts 에 실제로 있으면 사진에서 온 사실이므로 통과시킨다.
const INTERNAL_EXPRESSIONS = [
  // 내부 필드명 — 입력 스키마에만 있는 이름이다.
  /narrative_role|rationale|adjacent_overlap|is_visual_peak|caption_inputs|caption_state|applied_profile|describable_facts|omit_reason|photo_plan_id/gi,
  /앞_사진과_겹침|피드_안에서_색이_가장_진함/g,
  /target_profile_id|current_profile_id|empty_caption_ratio|caption_len|caption_coverage|emoji_rate|ending_style|linebreak_habit|opener_tendency|composition_mix|scale_mix|palette_hex|hue_mean|sat_mean|bright_mean/gi,
  // narrative_role 값과 순서 규칙 이름.
  /\b(opener|sustain|closer)\b/gi,
  /\border\.r\d/gi,
  /\bR[1-4]\b/g,
  // lib/order.js 의 순서 규칙 어휘.
  /서사\s*규칙|상위\s*밴드|총점|보너스|측정값|측정\s*색|색\s*거리|색상각|지향\s*방향|지향이\s*잰|앞자리|전환\s*자리|자리에\s*뒀다|번에\s*뒀다|한\s*색이\s*넓게/g,
  // 내부 측정 어휘. 관측한 색은 색 이름으로 말하므로 이 낱말이 필요하지 않다.
  /밝기|채도|점수|측정/g,
  // 내부 측정 수치 — adjacent_overlap 0.8 · bright_mean 0.712 같은 값.
  /\d+\.\d+/g
];

// facts 안에 그 표현이 실제로 있으면 사진의 사실이다. 없으면 내부 값이 샌 것이다.
const internalLeak = (value, facts) => {
  if (typeof value !== 'string') return null;
  for (const pattern of INTERNAL_EXPRESSIONS) {
    for (const [hit] of value.matchAll(pattern)) {
      if (!facts.some(fact => fact.includes(hit))) return hit;
    }
  }
  return null;
};

// 사용자에게 보이는 모든 문장을 검사한다: 타이틀 · 캡션 · 비움 이유 · 근거 note.
// 타이틀과 비움 고지는 피드 전체를 말하므로 모든 슬롯의 사실을 허용 범위로 본다.
const rejectInternalLeak = (observation, input) => {
  const factsByPhoto = new Map(input.feed.slots.map(slot => [slot.photo_id, slot.caption_inputs.describable_facts]));
  const everyFact = [...factsByPhoto.values()].flat();
  const check = (value, facts, where) => {
    const hit = internalLeak(value, facts);
    if (hit) throw new ContractError(where, `internal expression "${hit}" is not a fact of this photo`);
  };
  const notes = (evidenceList, facts, where) => {
    for (const item of evidenceList ?? []) check(item.note, facts, where+'.note');
  };
  if (observation.omission) { check(observation.omission.note,everyFact,'omission.note'); notes(observation.omission.evidence,everyFact,'omission.evidence'); }
  if (observation.output) check(observation.output.title, everyFact, 'output.title');
  for (const slot of observation.output ? observation.output.slots : [observation.slot]) {
    const facts = factsByPhoto.get(slot.photo_id) ?? [];
    check(slot.text, facts, 'slot.text');
    check(slot.omit_reason, facts, 'slot.omit_reason');
    notes(slot.evidence, facts, 'slot.evidence');
  }
  return observation;
};

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
    // 이 note 도 사용자가 펼쳐 보는 문장이다. 규칙을 왜 적용했는지는 남기고
    // 내부 필드명·원시 측정값은 쓰지 않는다 (PR #108 리뷰 1항).
    note:'앞 사진과 겹치는 신호를 입력 사진에서 다시 확인해, 이 피드에서 가장 높은 한 자리에만 비움 안정화 규칙을 적용했다'
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
  const selected = input.mode==='slot' ? input.feed.slots.filter(slot=>slot.photo_id===input.photo_id) : input.feed.slots;
  const slots = selected.map(forOutput);
  const appliedProfile=appliedForOutput(input.feed.applied_profile);
  const result = await requestStructuredModel({apiKey,model,fetchImpl,timeoutMs,maxTokens:8192,prompt,schema:schemas[input.mode],content:[{type:'text',text:JSON.stringify({mode:input.mode,applied_profile:appliedProfile,slots})}]});
  let observation;
  try {
    validateGenerateResponse(result.observation,input);
    const outputSlots=input.mode==='all'?result.observation.output.slots:[result.observation.slot];
    for (const slot of outputSlots) if (!slot.evidence.some(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id)) throw new Error('Missing own photo evidence');
    observation=stabilizeOmission(result.observation,input);
    if (input.mode==='all') observation={output:observation.output,omission:discloseOmission(observation.output)};
    validateGenerateResponse(observation,input);
    rejectInternalLeak(observation,input);
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
