import { handleProfileCacheCleanup } from '../../../../../lib/profile-cache-cleanup.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleProfileCacheCleanup(request);
}
