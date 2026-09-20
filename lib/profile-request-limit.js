// Server-only durable counters. Finite hashed buckets bound stored object growth.
import {createHash} from 'node:crypto';
import {RequestError} from './interaction.js';
import {createPrivateBlobStorage} from './profile-cache-storage.js';

const WINDOW_MS=60*60*1000;
export const PROFILE_LIMITS={bootstrap:120,connect:20,status:600};
const SESSION_LIMITS={connect:3,status:60};
export const limitUnavailable=()=>new RequestError('PROFILE_CONNECTION_UNAVAILABLE',503,'프로필 연결을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',true);
const digest=value=>createHash('sha256').update(value).digest('hex');

export function createProfileRequestLimit({storage,now=Date.now,limits=PROFILE_LIMITS,sessionLimits=SESSION_LIMITS,unavailable=limitUnavailable,exactSession=false}={}) {
  async function consume(key,maximum) {
    const client=storage??createPrivateBlobStorage({namespace:'profile-request-limit'});
    const time=now(),window=Math.floor(time/WINDOW_MS);
    for(let attempt=0;attempt<8;attempt++) {
      const row=await client.read(key);
      if(row && (!row.etag || row.value?.version!==1 || !Number.isSafeInteger(row.value.window)
        || !Number.isSafeInteger(row.value.count) || row.value.count<0 || row.value.window>window)) throw unavailable();
      const count=row?.value.window===window?row.value.count:0;
      if(count>=maximum) {
        const error=new RequestError('RATE_LIMITED',429,'요청이 많아요. 잠시 후 다시 시도해 주세요.',true);
        error.retryAfter=Math.max(1,Math.ceil(((window+1)*WINDOW_MS-time)/1000));throw error;
      }
      const written=await client.write(key,{version:1,window,count:count+1},{...(row?{ifMatch:row.etag}:{})});
      if(written) return;
    }
    throw unavailable();
  }
  return {async take(action,sessionId) {
    if(!Object.hasOwn(limits,action) || !Number.isSafeInteger(limits[action]) || limits[action]<1) throw unavailable();
    try {
      if(sessionId && Object.hasOwn(sessionLimits,action)) {
        // Profile traffic uses bounded buckets; paid model traffic opts into an exact session key.
        const scope=exactSession?sessionId:digest(sessionId).slice(0,2);
        await consume(`profile-request-limit/v1/${digest(action+':'+scope)}.json`,sessionLimits[action]);
      }
      await consume(`profile-request-limit/v1/${digest('global:'+action)}.json`,limits[action]);
    } catch(error) {if(error instanceof RequestError) throw error;throw unavailable();}
  }};
}
