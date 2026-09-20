import { readFile } from 'node:fs/promises';
import { ContractError, sameStructure, validateEvidence } from './contracts.js';
import { discloseOmission, RequestError, validateGenerateRequest, validateGenerateResponse } from './interaction.js';
import { ModelError, modelRoute, OUTPUT_MODEL, requestStructuredModel } from './model.js';
import { extractFromFreetext } from './target_profile.js';
import { readJsonRequest } from './upload.js';

const objectSchema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = {type:'string'};
// Photo evidence is server-owned: the provider only selects fact_index.
const evidence = objectSchema({kind:{type:'string',enum:['rule']},ref:string,note:string});
// The model selects a fact; the server supplies its verbatim public evidence (#123).
const slot = objectSchema({position:{type:'integer'},photo_id:string,caption_state:{type:'string',enum:['seed','omitted']},text:{type:['string','null']},omit_reason:{type:['string','null']},fact_index:{type:'integer'},evidence:{type:'array',items:evidence}});
const schemas = {all:objectSchema({output:objectSchema({title:string,slots:{type:'array',items:slot}})}),slot:objectSchema({slot})};
// Keep each URL literal: Turbopack must discover all four assets independently (#183).
const readPrompts = () => Promise.all([
  readFile(new URL('../prompts/shared/style_guard.md',import.meta.url),'utf8'),
  readFile(new URL('../prompts/output/title.md',import.meta.url),'utf8'),
  readFile(new URL('../prompts/output/caption.md',import.meta.url),'utf8'),
  readFile(new URL('../prompts/output/omit_reason.md',import.meta.url),'utf8')
]);
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
// 수식 없는 홑낱말('접시')은 관측문을 그대로 옮긴 대체텍스트다. 참이지만 사용자가 고쳐 쓸
// 거리로는 약하다 (#101). 고른 사실에 어절이 둘 이상 있으면 붙어 있는 수식까지 오려 낸다.
// 사실 자체가 한 어절이면 더 오려 낼 것이 없으므로 그대로 둔다.
export const bareMaterial = (seed,fact) => !/\s/.test(seed) && /\s/.test(fact);
// 두 실패는 같은 원인(모델이 고른 사실을 그대로 오려 내지 않음)이고 같은 교정으로 회복된다.
const HINT_SEED_REJECTED = 'Hint seed is not a verbatim phrase from its evidence';
const HINT_SEED_BARE = 'Hint seed is a bare word while its fact carries a modifier';
const HINT_RETRYABLE = new Set([HINT_SEED_REJECTED,HINT_SEED_BARE]);
// 거절된 소재와 고른 사실을 실어 보낸다. 이것이 없으면 교정이 '다시 해라' 밖에 못 된다.
const hintError = (message,seed,fact) => Object.assign(new Error(message),{seed,fact});

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
    if (!ownNotes[0].includes(seed)) throw hintError(HINT_SEED_REJECTED,seed,ownNotes[0]);
    if (bareMaterial(seed,ownNotes[0])) throw hintError(HINT_SEED_BARE,seed,ownNotes[0]);
  }
};

// 한 자리의 단서가 계약을 어겼다고 나머지 열네 자리를 버리지 않는다. 열다섯 자리를 한 번에
// 다시 생성하면 같은 자리가 또 걸리지만(실측 2/2 재실패), 그 자리만 mode=slot 으로 따로 물으면
// 통과했다(실측 6/6). 검사는 그대로 두고 다시 묻는 범위만 좁힌다 (#101).
const HINT_REPAIR_MAX = 2;
// 슬롯별 단서 위반만 골라낸다. 다른 위반이 섞여 있으면 이 경로로 고치지 않는다(null).
const hintFailures = (observation,input) => {
  const factsById=new Map(input.feed.slots.map(slot=>[slot.photo_id,slot.caption_inputs.describable_facts]));
  const failed=[];
  for (const slot of observation.output.slots) {
    if (slot.caption_state!=='seed') continue;
    try { validateHint(slot.text,factsById.get(slot.photo_id)??[],slot.evidence,slot.photo_id); }
    catch (error) { if (!HINT_RETRYABLE.has(error.message)) return null; failed.push(slot); }
  }
  return failed;
};

// 사진 한 장에 찍힌 글귀를 묶음 전체의 제목으로 올리면 묶음에 대해 거짓이 된다 (#101).
// 다섯 자 이상 이어진 발췌만 본다 — 짧은 낱말 겹침은 발췌가 아니다. 띄어쓰기·문장부호를
// 지운 뒤 비교하므로 '가을 맛집' 을 '가을맛집' 으로 붙여 써도 같은 발췌다. 두 자 이상의
// 숫자가 사진 글귀에 있던 것이면 다섯 자에 못 미쳐도 거부한다 — '25곳' 같은 한 장짜리 수치가
// 묶음 사실이 되는 길이다.
// ponytail: 한 자리 숫자는 보지 않는다. '사진 3장' 같은 묶음 수치와 구별할 근거가 없다.
const OVERLAY_LIFT_MIN = 5;
const bare = value => (typeof value==='string'?value:'').replace(/[\s\p{P}\p{S}]/gu,'');
export const liftedFromOverlay = (title, photos) => {
  const value=bare(title), digits=((typeof title==='string'?title:'').match(/\d+/g)??[]).filter(run=>run.length>=2);
  const lifted=[];
  for (const photo of photos ?? []) {
    const raw=typeof photo?.text_in_image==='string'?photo.text_in_image:'', overlay=bare(raw);
    for (let i=0;i+OVERLAY_LIFT_MIN<=overlay.length;i++) {
      const piece=overlay.slice(i,i+OVERLAY_LIFT_MIN);
      if (value.includes(piece)) lifted.push({photo_id:photo.photo_id??null,piece});
    }
    for (const run of digits) if (raw.includes(run)) lifted.push({photo_id:photo.photo_id??null,piece:run});
  }
  return lifted;
};
const validateTitleOverlay = (title, photos) => {
  if (liftedFromOverlay(title,photos).length) throw new Error('Title lifts a phrase from one photo on-image text');
};

const validatePublicOutput = (observation, input) => {
  const slots=input.mode==='all'?observation.output.slots:[observation.slot];
  const factsById=new Map(input.feed.slots.map(slot=>[slot.photo_id,slot.caption_inputs.describable_facts]));
  const allFacts=[...factsById.values()].flat();
  if (input.mode==='all') {
    validatePublicText(observation.output.title,allFacts);
    validateTitleOverlay(observation.output.title,input.context.photos);
  }
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
  fetchImpl = globalThis.fetch, timeoutMs = 45_000, beforeProvider
} = {}) {
  validateGenerateRequest(input);
  validateCanonicalCoverage(input);
  if (modelRoute(apiKey).source !== 'vision_model') throw new RequestError('GENERATION_UNAVAILABLE',503,'문장 생성이 아직 연결되지 않았어요. 나중에 다시 시도해 주세요.');
  await beforeProvider?.();
  const prompt = (await readPrompts()).join('\n\n');
  const selected = input.mode==='slot' ? input.feed.slots.filter(slot=>slot.photo_id===input.photo_id) : input.feed.slots;
  const slots=selected.map(forModelSlot);
  const appliedProfile=forModelProfile(input.feed.applied_profile);
  const started=performance.now();
  let correction='';
  for (let attempt=0;attempt<2;attempt++) {
    const remaining=timeoutMs-(performance.now()-started);
    if (remaining<=0) throw new ModelError('MODEL_TIMEOUT','Model operation exceeded its deadline.');
    const result = await requestStructuredModel({apiKey,model,fetchImpl,timeoutMs:remaining,maxTokens:8192,prompt:prompt+correction,schema:schemas[input.mode],content:[{type:'text',text:JSON.stringify({mode:input.mode,applied_profile:appliedProfile,slots})}]});
    // 고친 자리도 처음 응답과 똑같은 검사를 다시 통과해야 한다.
    const settle = candidate => {
      validateGenerateResponse(candidate,input);
      validatePublicOutput(candidate,input);
      const outputSlots=input.mode==='all'?candidate.output.slots:[candidate.slot];
      for (const slot of outputSlots) if (!slot.evidence.some(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id)) throw new Error('Missing own photo evidence');
      if (input.mode!=='all') return candidate;
      const settled={output:candidate.output,omission:discloseOmission(candidate.output.slots)};
      validateGenerateResponse(settled,input);
      validatePublicOutput(settled,input);
      return settled;
    };
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
      observation=settle(result.observation);
    } catch (error) {
      // mode=all 은 걸린 자리만 mode=slot 경로로 다시 받는다. 성한 자리는 건드리지 않는다.
      if (input.mode==='all' && HINT_RETRYABLE.has(error.message)) {
        const failed=hintFailures(result.observation,input);
        if (failed?.length && failed.length<=HINT_REPAIR_MAX) {
          for (const slot of failed) {
            const left=timeoutMs-(performance.now()-started);
            if (left<=0) throw new ModelError('MODEL_TIMEOUT','Model operation exceeded its deadline.');
            // 이 재귀는 provider 를 새로 부른다. beforeProvider 를 넘기지 않으면 예산 한 단위가
            // 모델 호출 여섯 번까지 덮어, 세션·전역 상한이 실제로 막는 호출량이 조용히 는다 (#185 리뷰 HIGH).
            // 걸린 자리를 다시 묻는 것은 별도 호출이므로 별도로 센다. 한 요청 안의 attempt 재시도는
            // 기존 계약대로 예산 한 단위 안에서 돈다 — 이 수정은 #185 가 새로 늘린 몫만 되돌린다.
            const fresh=await generateOutput({...input,mode:'slot',photo_id:slot.photo_id},{apiKey,model,fetchImpl,timeoutMs:left,beforeProvider});
            Object.assign(slot,fresh.slot);
          }
          try { return settle(result.observation); }
          catch (again) { throw Object.assign(new ModelError('MODEL_CONTRACT','Model output does not match the requested photo contract.'),{cause:again}); }
        }
      }
      // One bounded fresh selection attempt; never accept or rewrite an ungrounded phrase.
      // Evidence-note violations are not retried or hidden by canonical replacement.
      // mode=slot 은 다시 물을 더 좁은 범위가 없으므로 같은 요청을 한 번 더 보낸다. 교정에는
      // 걸린 소재와 고른 사실을 실어 준다 — '다시 해라' 만으로는 같은 실패로 되돌아왔다 (#101 실측).
      if (attempt===0 && HINT_RETRYABLE.has(error.message)) {
        correction=`\n이전 응답은 쓸 거리 ${JSON.stringify(error.seed)} 때문에 거부됐다. 그 슬롯이 고른 사실은 ${JSON.stringify(error.fact)}이다. 쓸 거리는 고른 사실 문장 안에서 서로 붙어 있는 두세 어절을 글자 그대로 오려 낸 것이어야 한다. 가운데 낱말을 건너뛰지 않고, 다른 사실의 낱말을 붙이지 않고, 조사나 어미를 바꿔 문장을 완성하지 않는다. 고른 사실에 수식이 있으면 수식까지 함께 오려 내고 수식 없는 홑낱말만 남기지 않는다. 모든 슬롯에 같은 방식을 적용한다. evidence는 규칙이 없으면 []이다.`;
        continue;
      }
      // 사용자에게는 같은 한 줄을 주되, 어느 규칙이 걸렸는지는 cause 로 남긴다.
      // 이것이 없으면 실모델 계약 실패를 로그만 보고 진단할 수 없다 (#101).
      throw Object.assign(new ModelError('MODEL_CONTRACT','Model output does not match the requested photo contract.'),{cause:error});
    }
    return observation;
  }
}

export async function handleGenerate(request, options) {
  const headers={'Cache-Control':'no-store'};
  const fail=(status,code,message,retryable=false,retryAfter)=>Response.json({error:{code,message,retryable}},
    {status,headers:{...headers,...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
  if(request.method!=='POST') { headers.Allow='POST'; return fail(405,'METHOD_NOT_ALLOWED','POST 요청으로 보내 주세요.'); }
  try {
    const input=await readJsonRequest(request);
    return Response.json(await generateOutput(input,options),{headers});
  } catch (error) {
    if(error instanceof RequestError) return fail(error.status,error.code,error.message,error.retryable,error.retryAfter);
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
