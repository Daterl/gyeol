import {instagramAccount} from './apify_ingest.js';
import {composeFeed} from './compose.js';
import {buildCurrentProfile} from './current_profile.js';
import {RequestError,validateCurationRequest,validateFeedResponse} from './interaction.js';
import {authenticateDuplicateFlags} from './photo-receipt.js';
import {resolveSnapshot as resolveStoredSnapshot} from './profile-cache.js';
import {extractFromFreetext,extractFromReference} from './target_profile.js';

const unverified=()=>new RequestError('PROFILE_NOT_VERIFIED',422,'확인된 공개 프로필을 다시 연결해 주세요.');
const unavailable=()=>new RequestError('PROFILE_RESOLVER_UNAVAILABLE',503,'프로필 연결을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',true);

// The resolver is a server dependency, never a request field. It must verify the signed
// reference and read the fresh public record from #143 storage, without starting ingest.
async function resolveProfile(input,resolveSnapshot,now) {
  if(typeof resolveSnapshot!=='function') throw unavailable();
  let record;
  try { record=await resolveSnapshot({url:input.profile_url,snapshotId:input.profile_snapshot_id}); }
  catch(error) {
    if(['INVALID_SNAPSHOT_REFERENCE','PROFILE_NOT_READY'].includes(error?.code)) throw unverified();
    throw unavailable();
  }
  if(!record?.snapshot || record.snapshot_id!==input.profile_snapshot_id || (record.status!==undefined && record.status!=='public')) throw unverified();
  const snapshot=record.snapshot;
  let account,source;
  try { account=instagramAccount(input.profile_url); source=instagramAccount(record.source_url); }
  catch { throw unverified(); }
  if(account.account!==source.account || snapshot.handle!==source.account
    || snapshot.provenance?.account!==source.account || snapshot.provenance?.source_url!==source.url
    || snapshot.provenance?.method!=='apify' || snapshot.provenance?.actor!=='apify/instagram-scraper'
    || typeof snapshot.snapshot_id!=='string' || !snapshot.snapshot_id
    || !Array.isArray(snapshot.posts) || snapshot.posts.length===0) throw unverified();
  const collected=Date.parse(record.collected_at),expires=record.expires_at;
  if(!Number.isFinite(collected) || !Number.isFinite(expires) || collected>now || expires<=collected
    || snapshot.provenance.collected_at!==record.collected_at) throw unverified();
  if(expires<=now) throw new RequestError('PROFILE_SNAPSHOT_EXPIRED',422,'프로필 연결이 만료됐어요. 공개 프로필을 다시 연결해 주세요.');
  return record;
}

export async function buildCuration(input,{
  resolveSnapshot=resolveStoredSnapshot,
  now=Date.now,
  receiptSecret=process.env.GYEOL_ANALYSIS_RECEIPT_SECRET
}={}) {
  validateCurationRequest(input);
  try { instagramAccount(input.profile_url); }
  catch { throw new RequestError('INVALID_REQUEST',400,'공개 Instagram 프로필 URL을 확인해 주세요.'); }
  const time=now();
  const record=await resolveProfile(input,resolveSnapshot,time);
  const photos=authenticateDuplicateFlags(input.photos,{collection:'selected',sessionId:input.session_id,secret:receiptSecret});
  const snapshot=record.snapshot;
  const prompt=input.prompt?.trim() || null;
  const createdAt=new Date(time).toISOString();
  const current=buildCurrentProfile({snapshot},createdAt);
  const target=prompt
    ?extractFromFreetext(prompt,{createdAt})
    :await extractFromReference(record.source_url,{registry:{[snapshot.handle]:snapshot},createdAt});
  const feed=composeFeed({photoAnalyses:photos,targetProfile:target,currentProfile:current,currentPhotoAnalyses:[],sessionId:input.session_id});
  const result=validateFeedResponse({feed,context:{photos,current,target,current_photos:[]}});
  return {...result,curation:{
    schema_version:'1.0',profile_snapshot_id:input.profile_snapshot_id,
    profile:{snapshot_id:snapshot.snapshot_id,source_url:record.source_url,collected_at:record.collected_at,
      expires_at:new Date(record.expires_at).toISOString(),ownership_verified:false,evidence_refs:structuredClone(snapshot.provenance.evidence_refs??{})},
    prompt:{text:prompt,evidence:prompt?[{kind:'user_text',ref:target.profile_id,note:'사용자가 입력한 큐레이션 방향'}]:[]},
    slots:feed.slots.map(slot=>({photo_id:slot.photo_id,position:slot.position,included:true,
      exclusion_candidate:structuredClone(slot.omit_suggestion??{recommended:false,reason:null,evidence:[]})}))
  }};
}
