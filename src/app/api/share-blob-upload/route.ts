import { handleShareBlobUpload } from '../../../../lib/share-api.js';
import { getShareService } from '../../../../lib/share-runtime.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleShareBlobUpload(request, { service: getShareService() });
}
