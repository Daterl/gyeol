import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// v2: the receipt also binds the measured structure_signature. Without that binding a caller could
// keep a valid receipt and swap the signature, and a forged signature decides a user-visible
// "이 사진은 빼는 게 낫겠습니다" (#97). The receipt is what makes an observation the server's own.
const VERSION = 2;
// null when the analyzer observed no structure — absence is itself a signed fact.
const signatureDigest = analysis => analysis?.structure_signature
  ? createHash('sha256').update(JSON.stringify(analysis.structure_signature)).digest('hex') : null;
const configured = secret => typeof secret === 'string' && secret.length >= 32;
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

export function createPhotoReceipt({ analysis, collection, digest, sessionId }, secret) {
  if (!configured(secret)) return null;
  const body = Buffer.from(JSON.stringify({
    v: VERSION, sessionId, collection, digest, photoId: analysis.photo_id,
    inputIndex: analysis.input_index, sigDigest: signatureDigest(analysis),
  })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function readPhotoReceipt(receipt, secret) {
  if (!configured(secret) || typeof receipt !== 'string' || receipt.length > 2048) return null;
  const [body, signature, extra] = receipt.split('.');
  const expected = sign(body ?? '', secret);
  if (extra || !signature || Buffer.byteLength(signature) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let value;
  try { value = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  const keys = Object.keys(value ?? {}).sort().join();
  if (keys !== ['collection','digest','inputIndex','photoId','sessionId','sigDigest','v'].sort().join()
    || value.v !== VERSION || !['selected','current'].includes(value.collection)
    || typeof value.sessionId !== 'string' || !value.sessionId
    || typeof value.photoId !== 'string' || !value.photoId
    || !Number.isInteger(value.inputIndex) || value.inputIndex < 0 || value.inputIndex > 19
    || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)
    || !(value.sigDigest === null || (typeof value.sigDigest === 'string' && /^[a-f0-9]{64}$/.test(value.sigDigest)))) return null;
  return value;
}

export function authenticateDuplicateFlags(photos, { collection, sessionId, secret }) {
  const originals = new Map();
  return photos.map(photo => {
    const receipt = readPhotoReceipt(photo.analysis_receipt, secret);
    const trusted = receipt && receipt.sessionId === sessionId && receipt.collection === collection
      && receipt.photoId === photo.photo_id && receipt.inputIndex === photo.input_index;
    const duplicateOf = trusted ? originals.get(receipt.digest) : null;
    if (trusted && !duplicateOf) originals.set(receipt.digest, photo.photo_id);
    // 서명이 이 서버가 잰 그 값일 때만 남긴다. 아니면 필드를 지운다 — 유사 권고가 근거를 잃는 것이
    // 근거 없는 권고를 내는 것보다 낫다(P2·P3).
    const signed = trusted && receipt.sigDigest !== null && receipt.sigDigest === signatureDigest(photo);
    const { structure_signature, ...rest } = photo;
    return {
      ...rest,
      ...(signed ? { structure_signature } : {}),
      quality_flags: [
        ...photo.quality_flags.filter(flag => !flag.startsWith('duplicate_of:')),
        ...(duplicateOf ? [`duplicate_of:${duplicateOf}`] : []),
      ],
    };
  });
}
