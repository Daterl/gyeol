import { readFile } from 'node:fs/promises';
import { ContractError } from './contracts.js';
import { RequestError, validateGenerateRequest, validateGenerateResponse } from './interaction.js';
import { DEFAULT_MODEL, ModelError, requestStructuredModel } from './model.js';
import { readJsonRequest } from './upload.js';

const objectSchema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string = {type:'string'};
const evidence = objectSchema({kind:{type:'string',enum:['ig_post','uploaded_photo','user_text','aggregate','rule']},ref:string,note:string});
const slot = objectSchema({position:{type:'integer'},photo_id:string,caption_state:{type:'string',enum:['filled','omitted']},text:{type:['string','null']},omit_reason:{type:['string','null']},evidence:{type:'array',items:evidence}});
const schemas = {all:objectSchema({output:objectSchema({title:string,slots:{type:'array',items:slot}})}),slot:objectSchema({slot})};
const promptFiles = ['shared/style_guard.md','output/title.md','output/caption.md','output/omit_reason.md'];

export async function generateOutput(input, {
  apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.GYEOL_OUTPUT_MODEL || DEFAULT_MODEL,
  fetchImpl = globalThis.fetch, timeoutMs = 20_000
} = {}) {
  validateGenerateRequest(input);
  if (!apiKey?.trim()) throw new RequestError('GENERATION_UNAVAILABLE',503,'문장 생성이 아직 연결되지 않았어요. 나중에 다시 시도해 주세요.');
  const prompt = (await Promise.all(promptFiles.map(file => readFile(new URL('../prompts/'+file,import.meta.url),'utf8')))).join('\n\n');
  const slots = input.mode==='slot' ? input.feed.slots.filter(slot=>slot.photo_id===input.photo_id) : input.feed.slots;
  const result = await requestStructuredModel({apiKey,model,fetchImpl,timeoutMs,maxTokens:8192,prompt,schema:schemas[input.mode],content:[{type:'text',text:JSON.stringify({mode:input.mode,applied_profile:input.feed.applied_profile,slots})}]});
  try {
    validateGenerateResponse(result.observation,input);
    const outputSlots=input.mode==='all'?result.observation.output.slots:[result.observation.slot];
    for (const slot of outputSlots) if (!slot.evidence.some(e=>e.kind==='uploaded_photo' && e.ref===slot.photo_id)) throw new Error('Missing own photo evidence');
  } catch { throw new ModelError('MODEL_CONTRACT','Model output does not match the requested photo contract.'); }
  return result.observation;
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
