import { readFile } from 'node:fs/promises';
import { ContractError, sameStructure, validateEvidence } from './contracts.js';
import { OMISSION_RULE, RequestError, validateGenerateRequest, validateGenerateResponse } from './interaction.js';
import { ModelError, OUTPUT_MODEL, requestStructuredModel } from './model.js';
import { measuredColorOverlap } from './order.js';
import { extractFromFreetext } from './target_profile.js';
import { readJsonRequest } from './upload.js';

const objectSchema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = {type:'string'};
const evidence = objectSchema({kind:{type:'string',enum:['ig_post','uploaded_photo','user_text','aggregate','rule']},ref:string,note:string});
// The model selects a fact; the server supplies its verbatim public evidence (#123).
const slot = objectSchema({position:{type:'integer'},photo_id:string,caption_state:{type:'string',enum:['seed','omitted']},text:{type:['string','null']},omit_reason:{type:['string','null']},fact_index:{type:'integer'},evidence:{type:'array',items:evidence}});
const schemas = {all:objectSchema({output:objectSchema({title:string,slots:{type:'array',items:slot}})}),slot:objectSchema({slot})};
const promptFiles = ['shared/style_guard.md','output/title.md','output/caption.md','output/omit_reason.md'];
const OMIT_OVERLAP_MIN = 0.9;
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
  position, photo_id, caption_inputs:{describable_facts:[...caption_inputs.describable_facts]}
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
      if (!facts.length && photos.some(item=>item.note!==NO_FACTS_NOTE)) throw new Error('Invented empty-fact note');
      if (slot.caption_state==='seed') {
        validatePublicText(slot.text,facts);
        const match=HINT_SHAPE.exec(typeof slot.text==='string'?slot.text:'');
        const seeds=match?.[1].split(HINT_SEED_SEPARATOR);
        if (!facts.length || !seeds || seeds.length>HINT_SEED_MAX || seeds.some(seed=>!seed.trim())) {
          throw new Error('seed text is not a short hint');
        }
        // Keep grounded short phrases. A paraphrase is replaced by the selected fact,
        // never accepted as new photographic evidence.
        if (seeds.some(seed=>!note.includes(seed))) slot.text=`쓸 거리: ${note}\n이 중 기억에 남은 건?`;
      }
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

// feed 가 적어 둔 caption_inputs.adjacent_overlap 은 경로마다 정의가 다르다:
// photo_plan 갈래는 관측 사실 겹침이고(lib/pipeline.js), 지향 갈래는 색 실측이다(lib/order.js).
// 이 둘을 한 값으로 대조하던 것이 #131 의 세 번째 원인이다 — 기본 경로에서는 절대 같아지지 않아
// 후보가 언제나 0개였다. 비움 판단은 context.photos 에서 다시 잰 색 겹침으로만 하고,
// feed 가 적어 둔 값은 그 경로의 정의로 대조해 위조를 걸러내는 데에만 쓴다.
const factsOverlap = (previous, slot) => {
  const facts=slot.caption_inputs.describable_facts;
  const earlier=new Set(previous.caption_inputs.describable_facts);
  return facts.length?facts.filter(fact=>earlier.has(fact)).length/facts.length:0;
};

const stabilizeOmission = (observation, input) => {
  if (input.mode!=='all' || observation.output.slots.some(slot=>slot.caption_state!=='seed')) return observation;
  const target=input.context.target;
  const targetLanguage=target.kind==='photo_plan'?null:target.language;
  const coverage=targetLanguage?.caption_coverage?.value;
  const ratios=[targetLanguage?.empty_caption_ratio?.value,
    ...(input.feed.applied_profile.disclosure==='corrected'?[input.context.current.language?.empty_caption_ratio?.value]:[])]
    .filter(value=>value!==undefined);
  // 안전망을 끄는 것은 "채워 달라"는 신호가 실제로 있을 때뿐이다. 지향이 없거나(photo_plan)
  // 커버리지를 말하지 않은 자유입력은 "전부 채워 달라"가 아니다 — 그 둘을 같게 본 것이 #131 이다.
  if (coverage==='all') return observation;
  // 관측된 빈 캡션 비율이 이 길이의 피드에서 한 자리에도 못 미치면 그 관측을 따른다 (ratio 0 포함).
  if (coverage!=='sparse' && ratios.length>0 && Math.max(...ratios)*input.feed.slots.length<1) return observation;
  const slotsByPosition=new Map(input.feed.slots.map(slot=>[slot.position,slot]));
  const photosById=new Map(input.context.photos.map(photo=>[photo.photo_id,photo]));
  const candidate=input.feed.slots.filter(slot=>slot.position>1).map(slot=>{
    const previous=slotsByPosition.get(slot.position-1);
    return {slot,previous,overlap:measuredColorOverlap(photosById.get(previous.photo_id),photosById.get(slot.photo_id))};
  }).filter(({slot,previous,overlap})=>
      slot.caption_inputs.adjacent_overlap===(target.kind==='photo_plan'?factsOverlap(previous,slot):overlap))
    .sort((a,b)=>b.overlap-a.overlap || a.slot.position-b.slot.position)[0];
  if (!candidate || candidate.overlap<OMIT_OVERLAP_MIN) return observation;
  // kind:'rule' 하나로 끝내면 "설계가 그렇게 정해서"와 구분되지 않는다. 판단에 실제로 쓴 앞 자리
  // 사진을 관측 근거로 함께 가리킨다. 측정값·내부 용어는 공개 문장에 쓰지 않는다 (#131 DoD).
  const rules=[{
    kind:'uploaded_photo', ref:candidate.previous.photo_id,
    note:'앞 사진과 이 사진의 색을 재어 비교했고, 피드 안에서 가장 가까운 쌍이었다'
  },{
    kind:'rule', ref:'gyeol.omit.overlap',
    note:'앞 사진과의 겹침이 피드 안에서 가장 높은 자리를 비움 제안으로 선택했다'
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
      ? `이번에는 ${total}자리 모두에 쓸 거리를 제안했어요.`
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
  const slots=selected.map(forModelSlot);
  const appliedProfile=forModelProfile(input.feed.applied_profile);
  const result = await requestStructuredModel({apiKey,model,fetchImpl,timeoutMs,maxTokens:8192,prompt,schema:schemas[input.mode],content:[{type:'text',text:JSON.stringify({mode:input.mode,applied_profile:appliedProfile,slots})}]});
  let observation;
  try {
    buildOwnPhotoNotes(result.observation,input);
    validateGenerateResponse(result.observation,input);
    validatePublicOutput(result.observation,input);
    const outputSlots=input.mode==='all'?result.observation.output.slots:[result.observation.slot];
    for (const slot of outputSlots) if (!slot.evidence.some(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id)) throw new Error('Missing own photo evidence');
    observation=stabilizeOmission(result.observation,input);
    if (input.mode==='all') observation={output:observation.output,omission:discloseOmission(observation.output)};
    validateGenerateResponse(observation,input);
    validatePublicOutput(observation,input);
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
