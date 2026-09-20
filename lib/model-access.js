// Server-only admission for paid model routes. Browser identity stays anonymous.
import {createHash,timingSafeEqual} from 'node:crypto';
import {RequestError} from './interaction.js';
import {createProfileRequestLimit} from './profile-request-limit.js';
import {authorizeProfileBrowser} from './profile-session.js';

const headers={'Cache-Control':'no-store','Vary':'Origin, Cookie'};
const equal=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b)
  && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const unavailable=()=>new RequestError('MODEL_ACCESS_UNAVAILABLE',503,'모델 요청을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',true);
const unauthorized=()=>new RequestError('UNAUTHORIZED',401,'앱 세션을 다시 시작해 주세요.');
const positive=(value)=>/^[1-9]\d*$/.test(value??'') && Number.isSafeInteger(Number(value))?Number(value):null;
function budgets(env=process.env) {
  const global=positive(env.GYEOL_MODEL_GLOBAL_REQUESTS_PER_HOUR);
  const session=positive(env.GYEOL_MODEL_SESSION_REQUESTS_PER_HOUR);
  if(global===null || session===null || session>global) throw unavailable();
  return {limits:{model:global},sessionLimits:{model:session}};
}

function serverSession(request,accessKey) {
  if(typeof accessKey!=='string' || accessKey.length<32 || accessKey===process.env.ANTHROPIC_API_KEY
    || accessKey===process.env.GYEOL_BROWSER_SESSION_SECRET || accessKey===process.env.BLOB_READ_WRITE_TOKEN
    || accessKey===process.env.PROFILE_CACHE_SECRET || accessKey===process.env.SHARE_STORAGE_SECRET) throw unavailable();
  if(request.headers.has('origin') || request.headers.has('sec-fetch-site') || request.headers.has('cookie')
    || request.headers.has('x-gyeol-csrf')) throw unauthorized();
  if(!equal(request.headers.get('authorization'),`Bearer ${accessKey}`)) throw unauthorized();
  return createHash('sha256').update('server:'+accessKey).digest('hex');
}

export function authenticateModelRequest(request,options={}) {
  return request.headers.has('authorization')
    ?serverSession(request,options.accessKey??process.env.GYEOL_MODEL_API_ACCESS_KEY)
    :authorizeProfileBrowser(request,options.browser);
}

export async function takeModelBudget(sessionId,options={}) {
  if(!/^[a-f0-9]{64}$/.test(sessionId)) throw unauthorized();
  const limiter=options.limiter??createProfileRequestLimit({...budgets(options.env),unavailable,exactSession:true,
    storage:options.storage,now:options.now});
  try {await limiter.take('model',sessionId);}
  catch(error) {if(error instanceof RequestError) throw error;throw unavailable();}
}

export function modelAccessErrorResponse(error) {
  if(!(error instanceof RequestError)) error=unavailable();
  return Response.json({error:{code:error.code,message:error.message,retryable:error.retryable}},
    {status:error.status,headers:{...headers,...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
}
