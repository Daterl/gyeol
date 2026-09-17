// Runtime contracts use only Node/JavaScript built-ins. No coercion of input values.
export class ContractError extends Error {
  constructor(path, message) { super(`${path}: ${message}`); this.name = 'ContractError'; }
}
const fail = (path, message) => { throw new ContractError(path, message); };
const ok = (condition, path, message) => { if (!condition) fail(path, message); };
const object = (v, p) => ok(v !== null && typeof v === 'object' && !Array.isArray(v), p, 'expected object');
const text = (v, p) => ok(typeof v === 'string' && v.trim().length > 0, p, 'expected nonempty string');
const number = (v, p, min = 0, max = Infinity) => ok(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max, p, `expected number ${min}..${max}`);
const integer = (v, p, min = 0, max = Infinity) => { number(v,p,min,max); ok(Number.isInteger(v),p,'expected integer'); };
const oneOf = (v, values, p) => ok(values.includes(v), p, `expected ${values.join('|')}`);
const array = (v, p) => ok(Array.isArray(v), p, 'expected array');
const strings = (v, p) => { array(v,p); v.forEach((s,i) => text(s,`${p}[${i}]`)); };
const date = (v,p) => { text(v,p); ok(/^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)),p,'expected ISO timestamp'); };
const bool = (v,p) => ok(typeof v === 'boolean',p,'expected boolean');
const empty = (v,p) => { object(v,p); ok(Object.keys(v).length === 0,p,'must be empty'); };
const keys = (v, allowed,p) => Object.keys(v).forEach(k => ok(allowed.includes(k),`${p}.${k}`,'unknown field'));

export function validateEvidence(v, p = 'evidence') {
  object(v,p); oneOf(v.kind,['ig_post','uploaded_photo','user_text','aggregate','rule'],`${p}.kind`);
  text(v.ref,`${p}.ref`); text(v.note,`${p}.note`); return v;
}
export function validateClaim(v, p = 'claim', profile = false) {
  object(v,p); ok(Object.hasOwn(v,'value') && v.value !== undefined,p,'missing value');
  number(v.confidence,`${p}.confidence`,0,1); array(v.evidence,`${p}.evidence`);
  ok(v.evidence.length > 0,`${p}.evidence`,'needs at least one evidence');
  v.evidence.forEach((e,i) => validateEvidence(e,`${p}.evidence[${i}]`));
  if (profile) ok(v.evidence.some(e => e.kind !== 'rule'),p,'rule-only profile claim is not personalization');
  return v;
}
// Walk every Claim, including nested claims, rather than trusting a response flag.
export function validateClaims(v, p = '$') {
  if (!v || typeof v !== 'object') return;
  if (!Array.isArray(v) && (Object.hasOwn(v,'value') || Object.hasOwn(v,'confidence'))) validateClaim(v,p);
  for (const [k,child] of Object.entries(v)) validateClaims(child,`${p}.${k}`);
}
const claimValue = (v,p,validate) => { validateClaim(v,p,true); validate(v.value,`${p}.value`); };
function mix(v,p,names) {
  object(v,p); keys(v,names,p); names.forEach(k=>number(v[k],`${p}.${k}`,0,1));
  ok(Math.abs(names.reduce((sum,k)=>sum+v[k],0)-1)<1e-9,p,'mix must sum to 1');
}
function color(v,p) {
  object(v,p); number(v.hue_mean,`${p}.hue_mean`,0,360); number(v.sat_mean,`${p}.sat_mean`,0,1); number(v.bright_mean,`${p}.bright_mean`,0,1);
  strings(v.palette_hex,`${p}.palette_hex`); ok(v.palette_hex.length<=3,p,'at most 3 colors');
  v.palette_hex.forEach(s=>ok(/^#[a-f\d]{6}$/i.test(s),p,'expected hex color'));
}
function visual(v,p) {
  object(v,p); keys(v,['palette','tone_words','composition_mix','scale_mix','subjects'],p);
  for(const [k,c] of Object.entries(v)) claimValue(c,`${p}.${k}`,(value,path)=> {
    if(k==='palette') color(value,path);
    else if(k==='composition_mix') mix(value,path,['full_frame','negative_space']);
    else if(k==='scale_mix') mix(value,path,['closeup','midshot','fullshot']);
    else strings(value,path);
  });
}
function language(v,p) {
  if(v===null) return;
  object(v,p); keys(v,['caption_len','emoji_rate','ending_style','linebreak_habit','empty_caption_ratio','banned_words'],p);
  strings(v.banned_words,`${p}.banned_words`);
  for(const [k,c] of Object.entries(v)) {
    if(k==='banned_words') continue;
    claimValue(c,`${p}.${k}`,(value,path)=> {
      if(k==='caption_len') { object(value,path); integer(value.p50,`${path}.p50`); integer(value.p90,`${path}.p90`,value.p50); oneOf(value.unit,['자'],`${path}.unit`); }
      else if(k==='ending_style') oneOf(value,['해요','다','명사형','혼합'],path);
      else if(k==='linebreak_habit') oneOf(value,['없음','짧게 자주','문단'],path);
      else number(value,path,0,k==='empty_caption_ratio'?1:Infinity);
    });
  }
}
function sequence(v,p) {
  object(v,p); keys(v,['carousel_count','opener_tendency'],p); integer(v.carousel_count,`${p}.carousel_count`);
  if(v.opener_tendency!==undefined) {
    claimValue(v.opener_tendency,`${p}.opener_tendency`,(value,path)=>oneOf(value,['풀샷','클로즈업','인물','불명'],path));
    if(v.carousel_count===0) ok(v.opener_tendency.value==='불명',p,'zero carousel evidence requires unknown tendency');
  }
}
export function validateProfile(v, axis = v?.axis) {
  const p=axis+'Profile'; object(v,p); oneOf(v.schema_version,['1.0'],p+'.schema_version'); oneOf(axis,['target','current'],p+'.axis'); oneOf(v.axis,[axis],p+'.axis');
  bool(v.present,p+'.present'); oneOf(v.account_scope,['main','sub','n/a'],p+'.account_scope'); integer(v.sample_size,p+'.sample_size'); date(v.created_at,p+'.created_at');
  object(v.completeness,p+'.completeness'); for(const k of ['visual','language','sequence']) number(v.completeness[k],`${p}.completeness.${k}`,0,1);
  if(!v.present) {
    ok(axis==='current',p,'target cannot be absent'); oneOf(v.account_scope,['n/a'],p+'.account_scope'); ok(v.profile_id===null,p+'.profile_id','absent ID must be null'); oneOf(v.source,['none'],p+'.source');
    ok(v.sample_size===0 && Object.values(v.completeness).every(n=>n===0),p,'absent samples/completeness must be zero');
    empty(v.visual,p+'.visual'); empty(v.sequence,p+'.sequence'); ok(v.language===null && v.raw_freetext===null,p,'absent language/text must be null'); return v;
  }
  text(v.profile_id,p+'.profile_id'); integer(v.sample_size,p+'.sample_size',1);
  oneOf(v.source,axis==='target'?['ig_reference','freetext']:['instagram_api','cached','photo_upload'],p+'.source');
  if(v.source==='freetext') text(v.raw_freetext,p+'.raw_freetext'); else ok(v.raw_freetext===null,p+'.raw_freetext','must be null');
  visual(v.visual,p+'.visual'); language(v.language,p+'.language'); sequence(v.sequence,p+'.sequence');
  ok((v.completeness.language===0)===(v.language===null),p,'language completeness must match null state');
  validateClaims(v); return v;
}
export function validatePhoto(v) {
  const p='PhotoAnalysis'; object(v,p); oneOf(v.schema_version,['1.0'],p+'.schema_version'); text(v.photo_id,p+'.photo_id'); text(v.file_ref,p+'.file_ref'); integer(v.input_index,p+'.input_index');
  color(v.color,p+'.color'); oneOf(v.composition,['full_frame','negative_space'],p+'.composition'); oneOf(v.scale,['closeup','midshot','fullshot'],p+'.scale');
  strings(v.subjects,p+'.subjects'); bool(v.has_face,p+'.has_face'); if(v.text_in_image!==null) text(v.text_in_image,p+'.text_in_image');
  strings(v.describable_facts,p+'.describable_facts'); strings(v.quality_flags,p+'.quality_flags');
  v.quality_flags.forEach(flag=>ok(['blurry','dark'].includes(flag)||/^duplicate_of:.+/.test(flag),p+'.quality_flags','unknown flag'));
  oneOf(v.analysis_source,['vision_model','heuristic'],p+'.analysis_source'); text(v.model,p+'.model'); date(v.analyzed_at,p+'.analyzed_at'); return v;
}
export function validateInputIds(ids) {
  strings(ids,'inputPhotoIds'); ok(ids.length>=3 && ids.length<=20,'inputPhotoIds','requires 3..20 photos');
  ok(new Set(ids).size===ids.length,'inputPhotoIds','duplicate IDs'); return ids;
}
export function validatePhotoConservation(feed, inputPhotoIds) {
  validateInputIds(inputPhotoIds); object(feed,'feed'); array(feed.slots,'slots');
  const ids=feed.slots.map(s=>s?.photo_id); ids.forEach((id,i)=>text(id,`slots[${i}].photo_id`));
  ok(ids.length===inputPhotoIds.length,'E2','output length differs from actual input');
  const actual=new Set(ids); ok(actual.size===ids.length && inputPhotoIds.every(id=>actual.has(id)),'E2','duplicate, missing or foreign photo ID');
  object(feed.invariants,'invariants'); ok(feed.invariants.input_count===inputPhotoIds.length && feed.invariants.output_count===ids.length && feed.invariants.unique_photo_ids===true,'E2','self-declared invariants disagree with observed data');
}
export function validatePositions(slots, count) {
  array(slots,'slots'); ok(slots.length===count,'E3','incorrect slot count');
  const positions=slots.map(s=>s?.position); positions.forEach((n,i)=>integer(n,`slots[${i}].position`,1,count));
  ok(new Set(positions).size===count,'E3','positions must cover 1..N exactly once');
}
export function validateDisclosure(applied, currentProfile) {
  object(applied,'applied_profile'); oneOf(applied.disclosure,['target_only','corrected'],'disclosure'); bool(applied.corrected,'corrected');
  if(applied.current_profile_id!==null) text(applied.current_profile_id,'current_profile_id');
  if(currentProfile!==undefined) {
    validateProfile(currentProfile,'current');
    ok(applied.current_profile_id===(currentProfile.present?currentProfile.profile_id:null),'E8','current profile ID differs from actual input');
  }
  if(applied.current_profile_id===null) ok(applied.disclosure==='target_only' && applied.corrected===false && Array.isArray(applied.deltas) && applied.deltas.length===0,'E8','absent current requires honest target-only disclosure');
  ok(applied.corrected===(applied.disclosure==='corrected'),'E8','corrected flag and disclosure disagree');
  if(!applied.corrected) ok(Array.isArray(applied.deltas) && applied.deltas.length===0,'E8','uncorrected profile cannot claim a delta');
}
export function validateFeed(v, inputPhotoIds, currentProfile) {
  object(v,'OrderedFeed'); oneOf(v.schema_version,['1.0'],'schema_version'); text(v.feed_id,'feed_id'); text(v.session_id,'session_id'); date(v.generated_at,'generated_at');
  validatePhotoConservation(v,inputPhotoIds); validatePositions(v.slots,inputPhotoIds.length); validateDisclosure(v.applied_profile,currentProfile);
  const a=v.applied_profile; text(a.target_profile_id,'target_profile_id'); visual(a.visual,'applied_profile.visual'); language(a.language,'applied_profile.language'); sequence(a.sequence,'applied_profile.sequence');
  array(a.deltas,'deltas'); ok(a.deltas.length<=1,'deltas','only one caption length gap');
  for(const d of a.deltas) { object(d,'delta'); oneOf(d.note_key,['caption_len_gap'],'delta.note_key'); oneOf(d.field,['language.caption_len.p50'],'delta.field'); oneOf(d.rule,['log_midpoint'],'delta.rule'); for(const k of ['target','current','resolved']) number(d[k],`delta.${k}`); array(d.evidence,'delta.evidence'); ok(d.evidence.length>0,'delta.evidence','needs evidence'); d.evidence.forEach(e=>validateEvidence(e)); }
  for(const s of v.slots) { oneOf(s.narrative_role,['opener','sustain','turn','closer'],'narrative_role'); validateClaim(s.rationale,'rationale'); text(s.rationale.value,'rationale.value'); object(s.caption_inputs,'caption_inputs'); strings(s.caption_inputs.describable_facts,'describable_facts'); number(s.caption_inputs.adjacent_overlap,'adjacent_overlap',0,1); bool(s.caption_inputs.is_visual_peak,'is_visual_peak'); }
  validateClaims(v); return v;
}
export function validateTitle(v) {
  object(v,'F3Export'); keys(v,['title','slots'],'F3Export'); text(v.title,'E6.title'); ok(!/[\r\n\u2028\u2029]/.test(v.title),'E6.title','must be one line'); ok(!Object.hasOwn(v,'titles'),'E6','title list is not allowed');
}
export function validateExport(v, feed) {
  object(feed,'export.feed'); array(feed.slots,'export.feed.slots');
  validatePositions(feed.slots,feed.slots.length);
  validateTitle(v); validatePositions(v.slots,feed.slots.length);
  const byPosition=new Map(feed.slots.map(s=>[s.position,s.photo_id]));
  for(const s of v.slots) {
    text(s.photo_id,'export.photo_id');
    ok(byPosition.get(s.position)===s.photo_id,'export.photo_id','photo identity differs from OrderedFeed position');
    if(s.caption_state==='omitted') text(s.omit_reason,'export.omit_reason');
    else ok(s.omit_reason===null,'export.omit_reason','filled/user reason must be null');
  }
  for(const s of v.slots) { oneOf(s.caption_state,['filled','omitted','user'],'caption_state'); if(s.caption_state==='omitted') ok(s.text===null,'text','omitted text must be null'); else text(s.text,'text'); array(s.evidence,'export.evidence'); ok(s.evidence.length>0,'export.evidence','needs evidence'); s.evidence.forEach(e=>validateEvidence(e)); }
  return v;
}
