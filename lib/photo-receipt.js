import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 1;
const configured = secret => typeof secret === 'string' && secret.length >= 32;
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

export function createPhotoReceipt({ analysis, collection, digest, sessionId }, secret) {
  if (!configured(secret)) return null;
  const body = Buffer.from(JSON.stringify({
    v: VERSION, sessionId, collection, digest, photoId: analysis.photo_id,
    inputIndex: analysis.input_index,
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
  if (keys !== ['collection','digest','inputIndex','photoId','sessionId','v'].sort().join()
    || value.v !== VERSION || !['selected','current'].includes(value.collection)
    || typeof value.sessionId !== 'string' || !value.sessionId
    || typeof value.photoId !== 'string' || !value.photoId
    || !Number.isInteger(value.inputIndex) || value.inputIndex < 0 || value.inputIndex > 19
    || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) return null;
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
    return {
      ...photo,
      quality_flags: [
        ...photo.quality_flags.filter(flag => !flag.startsWith('duplicate_of:')),
        ...(duplicateOf ? [`duplicate_of:${duplicateOf}`] : []),
      ],
    };
  });
}
