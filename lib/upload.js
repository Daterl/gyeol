// Node-only image boundary. Sharp is already installed by Next; declare the direct dependency explicitly.
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, MAX_REQUEST_BYTES, MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES, RequestError, UPLOAD_MEDIA_TYPES } from './interaction.js';

export async function readJsonRequest(request, limit = MAX_REQUEST_BYTES) {
  if (!request.headers.get('content-type')?.split(';')[0].trim().match(/^application\/json$/i)) {
    throw new RequestError('INVALID_REQUEST',400,'JSON 형식으로 보내 주세요.');
  }
  if (Number(request.headers.get('content-length')) > limit) throw new RequestError('REQUEST_TOO_LARGE',413,'요청 크기가 너무 커요.');
  let size=0; const chunks=[];
  if (request.body) for await (const chunk of request.body) {
    size+=chunk.byteLength;
    if (size>limit) throw new RequestError('REQUEST_TOO_LARGE',413,'요청 크기가 너무 커요.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError('INVALID_REQUEST',400,'JSON 내용을 읽을 수 없어요.'); }
}

export async function validateUpload(value) {
  const invalid = message => { throw new RequestError('INVALID_REQUEST',400,message); };
  if (!value || typeof value!=='object' || Array.isArray(value)) invalid('사진 한 장을 보내 주세요.');
  const allowed=['schema_version','session_id','collection','photo_id','input_index','file_ref','media_type','image_base64'];
  if (Object.keys(value).some(k=>!allowed.includes(k)) || value.schema_version!=='1.0') invalid('알 수 없는 업로드 형식이에요.');
  if (typeof value.photo_id!=='string' || !/^[A-Za-z0-9_-]{1,96}$/.test(value.photo_id)) invalid('사진 ID를 확인해 주세요.');
  if (typeof value.session_id!=='string' || !/^[A-Za-z0-9_-]{1,96}$/.test(value.session_id)) invalid('분석 세션을 확인해 주세요.');
  if (!['selected','current'].includes(value.collection)) invalid('사진 묶음을 확인해 주세요.');
  if (!Number.isInteger(value.input_index) || value.input_index<0 || value.input_index>19) invalid('사진 순서를 확인해 주세요.');
  if (typeof value.file_ref!=='string' || !value.file_ref.trim() || value.file_ref.length>512) invalid('파일 이름을 확인해 주세요.');
  if (!UPLOAD_MEDIA_TYPES.includes(value.media_type)) throw new RequestError('UNSUPPORTED_MEDIA_TYPE',415,'JPEG, PNG, WebP 사진을 선택해 주세요.');
  const encoded=value.image_base64;
  if (typeof encoded!=='string' || !encoded.length) invalid('사진 데이터를 보내 주세요.');
  if (encoded.length>4*Math.ceil(MAX_UPLOAD_BYTES/3)) throw new RequestError('IMAGE_TOO_LARGE',413,'사진은 한 장에 3MB까지 올릴 수 있어요.');
  if (encoded.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) invalid('사진 데이터를 읽을 수 없어요.');
  const bytes=Buffer.from(encoded,'base64');
  if (!bytes.length || bytes.toString('base64')!==encoded) invalid('사진 데이터를 읽을 수 없어요.');
  if (bytes.length>MAX_UPLOAD_BYTES) throw new RequestError('IMAGE_TOO_LARGE',413,'사진은 한 장에 3MB까지 올릴 수 있어요.');
  const detected = bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])) ? 'image/jpeg'
    : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' ? 'image/webp' : null;
  if (!detected) throw new RequestError('INVALID_IMAGE',422,'사진 형식을 읽을 수 없어요.');
  if (detected!==value.media_type) throw new RequestError('UNSUPPORTED_MEDIA_TYPE',415,'파일 형식과 사진 데이터가 달라요.');
  let metadata;
  try { metadata=await sharp(bytes,{limitInputPixels:MAX_IMAGE_PIXELS,failOn:'error'}).metadata(); }
  catch { throw new RequestError('INVALID_IMAGE',422,'읽을 수 없는 사진이거나 해상도가 너무 커요.'); }
  if (`image/${metadata.format}`!==value.media_type || (metadata.pages ?? 1)>1) throw new RequestError('UNSUPPORTED_MEDIA_TYPE',415,'정지된 JPEG, PNG, WebP 사진을 선택해 주세요.');
  if (!metadata.width || !metadata.height || Math.max(metadata.width,metadata.height)>MAX_IMAGE_SIDE || metadata.width*metadata.height>MAX_IMAGE_PIXELS) {
    throw new RequestError('IMAGE_DIMENSIONS',422,'사진의 긴 변은 8192px, 전체 크기는 40MP까지 가능해요.');
  }
  return {bytes,sessionId:value.session_id,collection:value.collection,photoId:value.photo_id,inputIndex:value.input_index,fileRef:value.file_ref,mediaType:value.media_type};
}

export async function readUploadRequest(request) {
  return validateUpload(await readJsonRequest(request,MAX_UPLOAD_BODY_BYTES));
}
