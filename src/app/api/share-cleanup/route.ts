import { handleShareCleanup } from '../../../../lib/share-api.js';
import { getShareService } from '../../../../lib/share-runtime.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleShareCleanup(request, { service: getShareService() });
}
