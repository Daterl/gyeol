import { ShareError } from './share-storage.js';

const noStore = { 'Cache-Control': 'no-store' };
const statusOf = code => {
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'GONE') return 410;
  if (code === 'CONFLICT') return 409;
  if (code === 'RATE_LIMITED') return 429;
  if (code === 'NOT_CONFIGURED') return 503;
  return code === 'INVALID_INPUT' || code.startsWith('INVALID_') || code === 'HASH_MISMATCH' || code === 'UPLOAD_INCOMPLETE'
    ? 400
    : 500;
};

const errorResponse = error => {
  const known = error instanceof ShareError;
  const code = known ? error.code : 'INTERNAL_ERROR';
  return Response.json(
    { error: { code, details: known ? error.details : {} } },
    { status: statusOf(code), headers: noStore },
  );
};

const callerOf = request =>
  (request.headers.get('x-forwarded-for') ?? 'anonymous')
    .split(',')[0]
    .trim()
    .slice(0, 128);
const bearer = request => {
  const value = request.headers.get('authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

async function readJson(request, maxBytes = 64 * 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw new ShareError('INVALID_INPUT');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ShareError('INVALID_INPUT');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ShareError('INVALID_INPUT');
  }
}

export async function handleShareUpload(request, { service } = {}) {
  try {
    if (!service) throw new ShareError('NOT_CONFIGURED');
    if (request.method !== 'POST') {
      return Response.json(
        { error: { code: 'METHOD_NOT_ALLOWED' } },
        { status: 405, headers: { ...noStore, Allow: 'POST' } },
      );
    }
    const input = await readJson(request);
    const caller = callerOf(request);
    let result;
    if (input.action === 'start') {
      result = await service.startShare({ photos: input.photos, caller });
    } else if (input.action === 'update') {
      result = await service.startUpdate({
        shareId: input.shareId,
        managementKey: bearer(request),
        ifMatch: request.headers.get('if-match') ?? undefined,
        photos: input.photos,
        caller,
      });
    } else if (input.action === 'session') {
      result = await service.openUploadSession(input.receipt, { caller });
    } else if (input.action === 'publish') {
      result = await service.publish({
        receipt: input.receipt,
        uploadToken: input.uploadToken,
        managementKey: bearer(request),
        curation: input.curation,
        ifMatch: request.headers.get('if-match') ?? undefined,
        caller,
      });
    } else {
      throw new ShareError('INVALID_INPUT');
    }
    return Response.json(result, { status: input.action === 'start' ? 201 : 200, headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleShare(request, { service, shareId, photoId } = {}) {
  try {
    if (!service) throw new ShareError('NOT_CONFIGURED');
    if (request.method !== 'GET') {
      return Response.json(
        { error: { code: 'METHOD_NOT_ALLOWED' } },
        { status: 405, headers: { ...noStore, Allow: 'GET' } },
      );
    }
    if (photoId !== undefined) {
      const image = await service.readImage(shareId, photoId);
      return new Response(image.body, {
        headers: { ...noStore, 'Content-Type': image.contentType },
      });
    }
    const result = await service.readShare(shareId);
    return Response.json(result.share, {
      headers: { ...noStore, ETag: result.etag },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleManage(request, { service, shareId } = {}) {
  try {
    if (!service) throw new ShareError('NOT_CONFIGURED');
    if (request.method !== 'POST') {
      return Response.json(
        { error: { code: 'METHOD_NOT_ALLOWED' } },
        { status: 405, headers: { ...noStore, Allow: 'POST' } },
      );
    }
    const input = await readJson(request, 1024);
    const options = {
      shareId,
      managementKey: bearer(request),
      ifMatch: request.headers.get('if-match') ?? undefined,
      caller: callerOf(request),
    };
    const result =
      input.action === 'rotate'
        ? await service.rotateKey(options)
        : input.action === 'revoke'
          ? await service.revoke(options)
          : (() => {
              throw new ShareError('INVALID_INPUT');
            })();
    return Response.json(result, { headers: { ...noStore, ETag: result.etag } });
  } catch (error) {
    return errorResponse(error);
  }
}
