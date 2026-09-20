// Server-only admission for paid model routes. Browser identity stays anonymous.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {RequestError} from './interaction.js';
import {createPrivateBlobStorage} from './profile-cache-storage.js';
import {authorizeProfileBrowser} from './profile-session.js';

const headers={'Cache-Control':'no-store','Vary':'Origin, Cookie'};
const WINDOW_MS=60*60*1000;
const BUDGET_KEY=`profile-request-limit/v1/${createHash('sha256').update('global:model').digest('hex')}.json`;
const MAX_ATTEMPTS=8;
const RETRY_DEADLINE_MS=5000;
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

const rateLimited=(time,window)=>{
  const error=new RequestError('RATE_LIMITED',429,'요청이 많아요. 잠시 후 다시 시도해 주세요.',true);
  error.retryAfter=Math.max(1,Math.ceil(((window+1)*WINDOW_MS-time)/1000));return error;
};
const validCounter=(value,window)=>Number.isSafeInteger(value?.window) && value.window<=window
  && Number.isSafeInteger(value.count) && value.count>=0;
const validSessions=(value,maximum)=>value.sessions && typeof value.sessions==='object'
  && !Array.isArray(value.sessions) && Object.keys(value.sessions).length<=maximum
  && Object.entries(value.sessions).every(([key,count])=>/^[a-f0-9]{64}$/.test(key)
    && Number.isSafeInteger(count) && count>0)
  && Object.values(value.sessions).reduce((sum,count)=>sum+count,0)<=value.count;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const throttleDelay=error=>Number.isSafeInteger(error?.retryAfter) && error.retryAfter>0
  ?error.retryAfter*1000:25;

export function createModelRequestLimit({storage,
  now=Date.now,env=process.env,wait=pause,salt=randomBytes(8).toString('hex')}={}) {
  const {limits,sessionLimits}=budgets(env),globalMaximum=limits.model,sessionMaximum=sessionLimits.model;
  storage??=createPrivateBlobStorage({namespace:'profile-request-limit'});
  return {async take(action,sessionId) {
    if(action!=='model' || !/^[a-f0-9]{64}$/.test(sessionId)) throw unavailable();
    const started=now(),window=Math.floor(started/WINDOW_MS),scope=createHash('sha256').update(sessionId).digest('hex');
    for(let attempt=0;attempt<MAX_ATTEMPTS && now()-started<RETRY_DEADLINE_MS;attempt++) {
      let row;
      try {row=await storage.read(BUDGET_KEY);} catch(error) {
        if(error?.code!=='RATE_LIMITED') throw unavailable();
        const delay=throttleDelay(error);
        if(now()-started+delay>=RETRY_DEADLINE_MS) throw unavailable();
        await wait(delay);continue;
      }
      if(row && (!row.etag || !validCounter(row.value,window)
        || (row.value.version!==1 && (row.value.version!==2
          || !validSessions(row.value,globalMaximum))))) throw unavailable();
      const current=row?.value.window===window
        ?{version:2,window,count:row.value.count,sessions:row.value.version===2?row.value.sessions:{}}
        :{version:2,window,count:0,sessions:{}};
      const sessionCount=current.sessions[scope]??0;
      if(current.count>=globalMaximum || sessionCount>=sessionMaximum) throw rateLimited(started,window);
      const value={...current,count:current.count+1,sessions:{...current.sessions,[scope]:sessionCount+1}};
      try {
        if(await storage.write(BUDGET_KEY,value,row?{ifMatch:row.etag}:{})) return;
      } catch(error) {
        if(error?.code!=='RATE_LIMITED') throw unavailable();
        const delay=throttleDelay(error);
        if(now()-started+delay>=RETRY_DEADLINE_MS) throw unavailable();
        await wait(delay);continue;
      }
      const ceiling=Math.min(100,20*(attempt+1));
      const delay=5+parseInt(createHash('sha256').update(`${salt}:${attempt}`).digest('hex').slice(0,2),16)%ceiling;
      if(now()-started+delay>=RETRY_DEADLINE_MS) break;
      await wait(delay);
    }
    throw unavailable();
  }};
}

let productionLimiter;

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
  try {
    const limiter=options.limiter??(options.env || options.storage || options.now
      ?createModelRequestLimit(options)
      :(productionLimiter??=createModelRequestLimit()));
    await limiter.take('model',sessionId);
  }
  catch(error) {if(error instanceof RequestError) throw error;throw unavailable();}
}

export function modelAccessErrorResponse(error) {
  if(!(error instanceof RequestError)) error=unavailable();
  return Response.json({error:{code:error.code,message:error.message,retryable:error.retryable}},
    {status:error.status,headers:{...headers,...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
}
