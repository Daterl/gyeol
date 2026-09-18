// Server-only browser capability: anonymous public-profile access, not identity.
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {RequestError} from './interaction.js';
import {readJsonRequest} from './upload.js';
import {createProfileRequestLimit,limitUnavailable} from './profile-request-limit.js';

const TTL=30*60*1000;
const COOKIE='__Host-gyeol-profile';
const headers={'Cache-Control':'no-store','Vary':'Origin, Cookie'};
const denied=()=>new RequestError('FORBIDDEN',403,'같은 사이트에서 다시 시도해 주세요.');
const unauthorized=()=>new RequestError('UNAUTHORIZED',401,'프로필 연결을 다시 시작해 주세요.');
const equal=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const mac=(secret,value)=>createHmac('sha256',secret).update(value).digest('base64url');

function configuration({secret=process.env.GYEOL_BROWSER_SESSION_SECRET,origin=process.env.GYEOL_APP_ORIGIN}={}) {
  if(typeof secret!=='string' || secret.length<32 || secret===process.env.APIFY_INGEST_ACCESS_KEY) throw limitUnavailable();
  let parsed;
  try {parsed=new URL(origin);} catch {throw limitUnavailable();}
  if(parsed.origin!==origin || parsed.protocol!=='https:') throw limitUnavailable();
  return {secret,origin};
}
function sameOrigin(request,origin) {
  if(new URL(request.url).origin!==origin || request.headers.get('origin')!==origin
    || request.headers.get('sec-fetch-site')!=='same-origin') throw denied();
}
function readSession(request,{secret,origin},now) {
  const cookies=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
  if(cookies.length!==1) throw unauthorized();
  const token=cookies[0].slice(COOKIE.length+1);
  if(token.length>1024) throw unauthorized();
  const [body,signature,...rest]=token.split('.');
  if(rest.length || !body || !equal(signature,mac(secret,'session:'+origin+':'+body))) throw unauthorized();
  let session;
  try {session=JSON.parse(Buffer.from(body,'base64url').toString());} catch {throw unauthorized();}
  if(!/^[a-f0-9]{64}$/.test(session?.id) || !Number.isSafeInteger(session.issued_at)
    || session.issued_at>now || session.expires_at!==session.issued_at+TTL || session.expires_at<=now) throw unauthorized();
  return session;
}
const csrf=(secret,origin,session)=>mac(secret,'csrf:'+origin+':'+session.id+':'+session.expires_at);

export function authorizeProfileBrowser(request,options={}) {
  const config=configuration(options);sameOrigin(request,config.origin);
  const session=readSession(request,config,(options.now??Date.now)());
  if(!equal(request.headers.get('x-gyeol-csrf'),csrf(config.secret,config.origin,session))) throw denied();
  return session.id;
}
export function profileErrorResponse(error) {
  if(!(error instanceof RequestError)) error=limitUnavailable();
  return Response.json({error:{code:error.code,message:error.message,retryable:error.retryable}},
    {status:error.status,headers:{...headers,...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
}
export async function handleProfileSession(request,options={}) {
  if(request.method!=='POST') return Response.json({error:{code:'METHOD_NOT_ALLOWED',message:'POST 요청으로 보내 주세요.',retryable:false}},
    {status:405,headers:{...headers,Allow:'POST'}});
  try {
    const config=configuration(options);sameOrigin(request,config.origin);
    const body=await readJsonRequest(request,1024);
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length) throw new RequestError('INVALID_REQUEST',400,'입력을 확인해 주세요.');
    await (options.limiter??createProfileRequestLimit()).take('bootstrap');
    const time=(options.now??Date.now)();
    let session;
    try {session=readSession(request,config,time);} catch {session={id:randomBytes(32).toString('hex'),issued_at:time,expires_at:time+TTL};}
    const encoded=Buffer.from(JSON.stringify(session)).toString('base64url');
    const token=encoded+'.'+mac(config.secret,'session:'+config.origin+':'+encoded);
    return Response.json({csrfToken:csrf(config.secret,config.origin,session),expires_at:session.expires_at},
      {headers:{...headers,'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor((session.expires_at-time)/1000)}`}});
  } catch(error) {return profileErrorResponse(error);}
}
