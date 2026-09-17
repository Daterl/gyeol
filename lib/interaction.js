// Shared request/response checks: browser-safe, no network or product generation.
import { ContractError, validateCaptionSlot, validateExport, validateFeed, validateInputIds, validatePhoto, validatePhotoPlan, validatePhotoRefs, validateProfile } from './contracts.js';

export const MAX_UPLOAD_BYTES = 3_000_000;
export const MAX_IMAGE_SIDE = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_UPLOAD_BODY_BYTES = 4_100_000;
export const MAX_REQUEST_BYTES = 250_000;
export const UPLOAD_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const REQUEST_TIMEOUT_MS = 25_000;

export class RequestError extends Error {
  constructor(code, status, message, retryable = false) {
    super(message); this.name = 'RequestError'; this.code = code; this.status = status; this.retryable = retryable;
  }
}
const requireValue = (valid, path, message) => { if (!valid) throw new ContractError(path, message); };
const record = (value, path) => requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'expected object');
const fields = (value, names, path) => { record(value,path); for (const key of Object.keys(value)) requireValue(names.includes(key),path+'.'+key,'unknown field'); };
const text = (value, path, max = 2000) => requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max,path,'expected bounded nonempty string');
const version = value => requireValue(value.schema_version === '1.0','request.schema_version','expected 1.0');
const photoList = (photos, min = 0) => {
  requireValue(Array.isArray(photos) && photos.length >= min && photos.length <= 20,'photos','invalid photo count');
  photos.forEach(validatePhoto);
  requireValue(new Set(photos.map(p=>p.photo_id)).size === photos.length,'photos','duplicate IDs');
  requireValue(photos.every((p,i)=>p.input_index===i),'photos','input_index must match selection order');
  return photos.map(p=>p.photo_id);
};
const reference = url => {
  text(url,'reference.url',512);
  let parsed;
  try { parsed = new URL(url); } catch { throw new ContractError('reference.url','invalid URL'); }
  requireValue(parsed.protocol==='https:' && ['instagram.com','www.instagram.com'].includes(parsed.hostname)
    && !parsed.username && !parsed.password && /^\/[\w.]+\/?$/.test(parsed.pathname),'reference.url','expected Instagram account URL');
};

export function validateIdentity(identity) {
  fields(identity,['target','current'],'identity');
  for (const axis of ['target','current']) {
    const value=identity[axis]; record(value,'identity.'+axis);
    if (value.kind==='none') fields(value,['kind'],axis);
    else if (value.kind==='reference') { fields(value,['kind','url'],axis); reference(value.url); }
    else if (axis==='target' && value.kind==='text') { fields(value,['kind','text'],axis); text(value.text,'target.text'); }
    else if (axis==='current' && value.kind==='posts') {
      fields(value,['kind','photos','captions'],axis); photoList(value.photos,1);
      if (value.captions!==undefined) requireValue(Array.isArray(value.captions) && value.captions.length===value.photos.length
        && value.captions.every(c=>typeof c==='string' && c.length<=5000),'current.captions','must match photos');
    } else throw new ContractError(axis+'.kind','unsupported identity path');
  }
  return identity;
}

export function validateOrderRequest(value) {
  fields(value,['schema_version','session_id','photos','identity'],'order'); version(value); text(value.session_id,'session_id',96);
  const ids=photoList(value.photos,3); validateInputIds(ids); validateIdentity(value.identity);
  if (value.identity.current.kind==='posts') requireValue(value.identity.current.photos.every(p=>!ids.includes(p.photo_id)), 'current.photos','current posts must have separate IDs');
  return value;
}

export function validateContext(context) {
  fields(context,['photos','current','target','current_photos'],'context');
  const ids=photoList(context.photos,3); validateInputIds(ids);
  const currentIds=photoList(context.current_photos);
  requireValue(currentIds.every(id=>!ids.includes(id)),'current_photos','IDs overlap with selected photos');
  validateProfile(context.current,'current');
  if (context.current.source==='photo_upload') {
    requireValue(currentIds.length>0 && context.current.sample_size===currentIds.length,'current_photos','missing actual current photo set');
    validatePhotoRefs(context.current,currentIds,'current');
  } else requireValue(currentIds.length===0,'current_photos','only photo_upload may include current photos');
  if (context.target?.kind==='photo_plan') {
    validatePhotoPlan(context.target); requireValue(context.target.sample_size===ids.length,'target.sample_size','photo count differs');
    validatePhotoRefs(context.target,ids,'PhotoPlan');
  } else validateProfile(context.target,'target');
  return ids;
}

export function validateFeedResponse(value) {
  fields(value,['feed','context'],'feedResponse');
  const ids=validateContext(value.context);
  validateFeed(value.feed,ids,value.context.current,value.context.target,value.context.photos,value.context.current_photos.map(p=>p.photo_id));
  return value;
}

export function validateGenerateRequest(value) {
  fields(value,['schema_version','mode','feed','context','photo_id'],'generate'); version(value);
  validateFeedResponse({feed:value.feed,context:value.context});
  requireValue(['all','slot'].includes(value.mode),'generate.mode','expected all|slot');
  if (value.mode==='slot') requireValue(value.feed.slots.some(s=>s.photo_id===value.photo_id),'generate.photo_id','unknown requested photo');
  else requireValue(!Object.hasOwn(value,'photo_id'),'generate.photo_id','only slot requests select a photo');
  return value;
}

export function validateGenerateResponse(value, request) {
  validateGenerateRequest(request);
  const ids=request.context.photos.map(p=>p.photo_id);
  if (request.mode==='all') {
    fields(value,['output'],'generation'); validateExport(value.output,request.feed,ids);
    requireValue(value.output.slots.every(s=>s.caption_state!=='user'),'generation','server cannot invent a user edit');
  } else {
    fields(value,['slot'],'generation'); validateCaptionSlot(value.slot,ids);
    const original=request.feed.slots.find(s=>s.photo_id===request.photo_id);
    requireValue(value.slot.photo_id===request.photo_id && value.slot.position===original.position,'generation.slot','wrong requested slot');
    requireValue(value.slot.caption_state!=='user','generation.slot','server cannot invent a user edit');
  }
  return value;
}

export function validateErrorResponse(value) {
  fields(value,['error'],'errorResponse'); fields(value.error,['code','message','retryable'],'error');
  requireValue(typeof value.error.code==='string' && /^[A-Z][A-Z_]{1,63}$/.test(value.error.code),'error.code','invalid error code');
  text(value.error.message,'error.message',500); requireValue(typeof value.error.retryable==='boolean','error.retryable','expected boolean');
  return value;
}
