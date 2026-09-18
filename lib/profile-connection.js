import {timingSafeEqual} from 'node:crypto';
import {createInstagramIngest,instagramAccount} from './apify_ingest.js';
import {ContractError} from './contracts.js';
import {RequestError} from './interaction.js';
import {createProfileCache} from './profile-cache.js';
import {readJsonRequest} from './upload.js';

const headers={'Cache-Control':'no-store'};
const invalid=()=>new RequestError('INVALID_REQUEST',400,'프로필 연결 입력을 확인해 주세요.');
const unavailable=()=>new RequestError('PROFILE_CONNECTION_UNAVAILABLE',503,'프로필 연결을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',true);
const failed=()=>new RequestError('PROFILE_CONNECTION_FAILED',502,'프로필 연결 결과를 확인하지 못했어요. 다시 시도해 주세요.',true);
const statuses=new Set(['missing','pending','public','private','not_found','timeout','cost_limit','unconfirmed','provider_error','expired']);
const errorCodes=new Set(['PRIVATE_ACCOUNT','ACCOUNT_NOT_FOUND','PROVIDER_TIMEOUT','COST_LIMIT','ACCOUNT_UNCONFIRMED','ACCESS_UNAVAILABLE','START_UNCONFIRMED','PROVIDER_ERROR']);

function validateRequest(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || input.schema_version!=='1.0'
    || !['connect','status'].includes(input.action)) throw invalid();
  const allowed=['schema_version','action','profile_url',...(input.action==='connect'?['confirmLive','refresh']:[])];
  if(Object.keys(input).some(key=>!allowed.includes(key)) || typeof input.profile_url!=='string' || input.profile_url.length>512) throw invalid();
  try {instagramAccount(input.profile_url);} catch {throw invalid();}
  if(input.action==='connect' && (input.confirmLive!==true || (input.refresh!==undefined && typeof input.refresh!=='boolean'))) throw invalid();
}

// Construct the wire result explicitly: never expose stored snapshots, provider
// receipts, storage paths, tokens, or arbitrary error details to this endpoint.
function connectionView(value) {
  if(!statuses.has(value?.status) || typeof value.refresh_required!=='boolean'
    || (value.expires_at!==undefined && !Number.isFinite(value.expires_at))) throw failed();
  if(value.status==='public' && (typeof value.snapshotId!=='string' || !value.snapshotId || !Number.isFinite(value.expires_at))) throw failed();
  if(value.error_code!==undefined && !errorCodes.has(value.error_code)) throw failed();
  return {status:value.status,refresh_required:value.refresh_required,
    ...(value.expires_at!==undefined?{expires_at:value.expires_at}:{}),
    ...(value.status==='public'?{snapshotId:value.snapshotId}:{}),
    ...(value.error_code?{error_code:value.error_code}:{})};
}

export async function handleProfileConnection(request,{accessKey=process.env.APIFY_INGEST_ACCESS_KEY,cache}={}) {
  if(request.method!=='POST') return Response.json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청으로 보내 주세요.',retryable:false}},{status:405,headers:{...headers,Allow:'POST'}});
  try {
    if(typeof accessKey!=='string' || accessKey.length<32) throw unavailable();
    const actual=request.headers.get('authorization')??'',expected=`Bearer ${accessKey}`;
    if(Buffer.byteLength(actual)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) throw new RequestError('UNAUTHORIZED',401,'프로필 연결 권한을 확인해 주세요.');
    const input=await readJsonRequest(request,8192);validateRequest(input);
    const client=cache??createProfileCache({ingest:createInstagramIngest({accessKey})});
    const result=connectionView(input.action==='connect'
      ?await client.connect({url:input.profile_url,refresh:input.refresh??false})
      :await client.inspect({url:input.profile_url}));
    return Response.json(result,{status:result.status==='pending'?202:200,headers});
  } catch(error) {
    if(error instanceof ContractError) error=invalid();
    if(!(error instanceof RequestError)) error=['STORAGE_ERROR','NOT_CONFIGURED'].includes(error?.code)?unavailable():failed();
    return Response.json({error:{code:error.code,message:error.message,retryable:error.retryable}},{status:error.status,headers});
  }
}
