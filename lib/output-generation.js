import { readFile } from 'node:fs/promises';
import { ContractError, sameStructure, validateEvidence } from './contracts.js';
import { discloseOmission, RequestError, validateGenerateRequest, validateGenerateResponse } from './interaction.js';
import { ModelError, OUTPUT_MODEL, requestStructuredModel } from './model.js';
import { extractFromFreetext } from './target_profile.js';
import { readJsonRequest } from './upload.js';

const objectSchema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = {type:'string'};
// Photo evidence is server-owned: the provider only selects fact_index.
const evidence = objectSchema({kind:{type:'string',enum:['rule']},ref:string,note:string});
// The model selects a fact; the server supplies its verbatim public evidence (#123).
const slot = objectSchema({position:{type:'integer'},photo_id:string,caption_state:{type:'string',enum:['seed','omitted']},text:{type:['string','null']},omit_reason:{type:['string','null']},fact_index:{type:'integer'},evidence:{type:'array',items:evidence}});
const schemas = {all:objectSchema({output:objectSchema({title:string,slots:{type:'array',items:slot}})}),slot:objectSchema({slot})};
const promptFiles = ['shared/style_guard.md','output/title.md','output/caption.md','output/omit_reason.md'];
const languageFields = ['caption_len','emoji_rate','ending_style','linebreak_habit','caption_coverage'];
const internalFields = ['mode','slots','position','rationale','narrative_role','caption_inputs','describable_facts',
  'applied_profile','target_profile_id','current_profile_id','photo_plan_id','disclosure','language','caption_state',
  'omit_reason','photo_id','fact_index','empty_caption_ratio','caption_coverage','caption_len','emoji_rate','ending_style',
  'linebreak_habit','banned_words','p50','p90','unit'];
const internalFieldPattern = new RegExp(`\\b(?:${internalFields.join('|')}|R[1-4])\\b`,'gi');
const forbiddenOutputPatterns = [
  /\b(?:target_only|corrected)\b/i,
  /(?:밝기|채도|색상각)/,
  /\b(?:adjacent_overlap|is_visual_peak|hue_mean|sat_mean|bright_mean|hue|sat|bright|saturation|brightness)\b/i,
  /(?:색\s*거리|측정\s*색|지향\s*방향|서사\s*규칙|앞자리\s*사진|남은\s*사진\s*중)/,
  /점수가\s*(?:가장\s*)?(?:높|낮)/,
  /(?:\d+\s*번(?:째)?(?:\s*자리)?(?:에)?|자리에)\s*(?:뒀|두었|배치)/,
  /색(?:조|감)?(?:의)?\s*흐름[^\n]{0,30}(?:연결|배치|정렬)/,
  // 필드명을 안 부르고 값만 옮겨 적는 경로가 남는다: '앞 사진과의 겹침이 0.786 이라'.
  // 내부 측정값은 전부 소수다. 사진 설명에 소수가 필요한 경우는 없다.
  /\d+\.\d+/
];

// style_guard.md 의 공통 금지어·단정 표현. 규칙이 프롬프트에만 있으면 지켜지지 않는다 (#101).
const BANNED_WORDS = ['이처럼','또한','이를 통해','이러한','마침내','최고의','완벽한','반드시'];
// seed 는 완성된 캡션이 아니라 사용자가 자기 말로 완성할 단서다 (P1).
const HINT_SHAPE = /^쓸 거리: (.+)\n이 중 기억에 남은 건\?$/;
const HINT_SEED_SEPARATOR = ' · ';
const HINT_SEED_MAX = 2;
// 사실이 하나도 없을 때 모델이 한계 문구를 지어내지 않도록 고정한다.
export const NO_FACTS_NOTE = '확인한 관측 사실이 없음';

const forModelLanguage = language => {
  if (!language) return null;
  const projected={};
  for (const field of languageFields) if (language[field]!==undefined) projected[field]=structuredClone(language[field].value);
  if (language.banned_words!==undefined) projected.banned_words=[...language.banned_words];
  return projected;
};
const forModelProfile = profile => ({
  disclosure:profile.disclosure, language:forModelLanguage(profile.language)
});
const forModelSlot = ({position,photo_id,caption_inputs}) => ({
  position, photo_id, caption_inputs:{describable_facts:caption_inputs.describable_facts.map((text,fact_index)=>({fact_index,text}))}
});
const validatePublicText = (value, facts=[]) => {
  if (typeof value!=='string') return;
  if (forbiddenOutputPatterns.some(pattern=>pattern.test(value))) throw new Error('Internal ordering detail in public output');
  for (const word of BANNED_WORDS) if (value.includes(word)) throw new Error('Banned style word in public output');
  const grounded=new Set(facts.flatMap(fact=>fact.match(internalFieldPattern)??[]).map(field=>field.toLowerCase()));
  for (const field of value.match(internalFieldPattern)??[]) {
    if (!grounded.has(field.toLowerCase())) throw new Error('Ungrounded internal field in public output');
  }
};
// 사용자에게 보이는 사진 근거 note 는 그 슬롯의 관측 사실과 글자 단위로 같아야 한다.
const validateOwnPhotoNote = (note, facts) => {
  if (facts.length===0) {
    if (note!==NO_FACTS_NOTE) throw new Error('Empty facts must use the fixed note');
    return;
  }
  if (!facts.includes(note)) throw new Error('Photo evidence note is not a verbatim fact');
};
// Indexed responses select a fact; the server owns its public evidence text.
// Responses without an index retain the existing strict/near-verbatim contract.
const buildOwnPhotoNotes = (observation,input) => {
  const slots=input.mode==='all'?observation.output.slots:[observation.slot];
  const factsById=new Map(input.feed.slots.map(slot=>[slot.photo_id,slot.caption_inputs.describable_facts]));
  for (const slot of slots) {
    const facts=factsById.get(slot.photo_id);
    if (!facts || !Array.isArray(slot.evidence)) throw new Error('Unknown photo or invalid evidence');
    if (Object.hasOwn(slot,'fact_index')) {
      const index=slot.fact_index;
      if (!Number.isInteger(index) || index<0 || (facts.length ? index>=facts.length : index!==0)) {
        throw new Error('fact_index is out of range');
      }
      // Validate supplied photo evidence before replacement can hide malformed fields.
      for (const item of slot.evidence) if (item.kind==='uploaded_photo') validateEvidence(item);
      // Never discard a foreign photo reference or multiple contradictory photo claims.
      const photos=slot.evidence.filter(item=>item.kind==='uploaded_photo');
      if (photos.length>1 || photos.some(item=>item.ref!==slot.photo_id)) throw new Error('Invalid photo evidence');
      for (const item of slot.evidence) validatePublicText(item.note,facts);
      const note=facts.length?facts[index]:NO_FACTS_NOTE;
      if (photos.some(item=>item.note!==note)) throw new Error('Photo evidence note does not match fact_index');
      const others=slot.evidence.filter(item=>item.kind!=='uploaded_photo');
      // An empty optional rule says nothing; omit it without inventing an explanation.
      slot.evidence=[{kind:'uploaded_photo',ref:slot.photo_id,note},...others.filter(item=>
        !(item.kind==='rule' && typeof item.ref==='string' && item.ref.trim() && typeof item.note==='string' && !item.note.trim()))];
      delete slot.fact_index;
      continue;
    }
    const own=slot.evidence.filter(item=>item.kind==='uploaded_photo' && item.ref===slot.photo_id);
    if (own.length!==1 || facts.includes(own[0].note)) continue;
    const matches=facts.filter(fact=>typeof own[0].note==='string' && fact.includes(own[0].note) && own[0].note.length/fact.length>=0.7);
    if (matches.length===1) own[0].note=matches[0];
  }
  return observation;
};
const validateHint = (text,facts,evidence,photoId) => {
  const match=HINT_SHAPE.exec(typeof text==='string'?text:'');
  if (!match) throw new Error('seed text is not a short hint');
  const seeds=match[1].split(HINT_SEED_SEPARATOR);
  if (seeds.length>HINT_SEED_MAX) throw new Error('Hint carries more seeds than the contract allows');
  const photoEvidence=evidence.filter(item=>item.kind==='uploaded_photo');
  const ownNotes=photoEvidence.filter(item=>item.ref===photoId).map(item=>item.note);
  if (photoEvidence.length!==1 || ownNotes.length!==1 || !facts.includes(ownNotes[0])) {
    throw new Error('Seed needs one verbatim fact from its own photo');
  }
  for (const seed of seeds) {
    if (!seed.trim()) throw new Error('Empty hint seed');
    if (!ownNotes[0].includes(seed)) throw new Error('Hint seed is not a verbatim phrase from its evidence');
  }
};

const validatePublicOutput = (observation, input) => {
  const slots=input.mode==='all'?observation.output.slots:[observation.slot];
  const factsById=new Map(input.feed.slots.map(slot=>[slot.photo_id,slot.caption_inputs.describable_facts]));
  const allFacts=[...factsById.values()].flat();
  if (input.mode==='all') validatePublicText(observation.output.title,allFacts);
  for (const slot of slots) {
    const facts=factsById.get(slot.photo_id)??[];
    validatePublicText(slot.text,facts); validatePublicText(slot.omit_reason,facts);
    for (const item of slot.evidence) {
      validatePublicText(item.note,facts);
      if (item.kind==='uploaded_photo' && item.ref===slot.photo_id) validateOwnPhotoNote(item.note,facts);
    }
    if (slot.caption_state==='seed') validateHint(slot.text,facts,slot.evidence,slot.photo_id);
  }
  if (observation.omission) {
    validatePublicText(observation.omission.note,allFacts);
    for (const item of observation.omission.evidence) validatePublicText(item.note,allFacts);
  }
};

const validateCanonicalCoverage = input => {
  const target=input.context.target;
  if(target.kind==='photo_plan' || target.source!=='freetext') return;
  const canonical=extractFromFreetext(target.raw_freetext,{profileId:target.profile_id,createdAt:target.created_at});
  if(!sameStructure(target.language?.caption_coverage,canonical.language?.caption_coverage)) {
    throw new ContractError('context.target.language.caption_coverage','differs from canonical freetext extraction');
  }
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
  const slots=selected.map(forModelSlot);
  const appliedProfile=forModelProfile(input.feed.applied_profile);
  const started=performance.now();
  let correction='';
  for (let attempt=0;attempt<2;attempt++) {
    const remaining=timeoutMs-(performance.now()-started);
    if (remaining<=0) throw new ModelError('MODEL_TIMEOUT','Model operation exceeded its deadline.');
    const result = await requestStructuredModel({apiKey,model,fetchImpl,timeoutMs:remaining,maxTokens:8192,prompt:prompt+correction,schema:schemas[input.mode],content:[{type:'text',text:JSON.stringify({mode:input.mode,applied_profile:appliedProfile,slots})}]});
    let observation;
    try {
      // Only the server counts omissions; model disclosure prose is not evidence.
      if (Object.hasOwn(result.observation,'omission')) throw new Error('Model cannot supply omission metadata');
      buildOwnPhotoNotes(result.observation,input);
      // Repair only the fixed hint separator, before the unchanged fact checks.
      const hintSlots=input.mode==='all'?result.observation.output.slots:[result.observation.slot];
      for (const slot of hintSlots) if (slot.caption_state==='seed' && typeof slot.text==='string') {
        slot.text=slot.text.replace(/\\n(?=이 중 기억에 남은 건\?$)/,'\n');
      }
      validateGenerateResponse(result.observation,input);
      validatePublicOutput(result.observation,input);
      const outputSlots=input.mode==='all'?result.observation.output.slots:[result.observation.slot];
      for (const slot of outputSlots) if (!slot.evidence.some(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id)) throw new Error('Missing own photo evidence');
      observation=result.observation;
      if (input.mode==='all') observation={output:observation.output,omission:discloseOmission(observation.output.slots)};
      validateGenerateResponse(observation,input);
      validatePublicOutput(observation,input);
    } catch (error) {
      // One bounded fresh selection attempt; never accept or rewrite an ungrounded phrase.
      // Evidence-note violations are not retried or hidden by canonical replacement.
      if (attempt===0 && error.message==='Hint seed is not a verbatim phrase from its evidence') {
        correction='\n이전 응답은 선택한 사실 밖의 소재 때문에 거부됐다. 이번에는 각 슬롯의 fact_index로 선택한 사실 문자열 전체를 그대로 쓸 거리 뒤에 복사한다. 줄이거나 재조합하지 않는다. evidence는 규칙이 없으면 []이다.';
        continue;
      }
      throw new ModelError('MODEL_CONTRACT','Model output does not match the requested photo contract.');
    }
    return observation;
  }
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
