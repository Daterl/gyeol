import { handleShareUpload } from '../../../../lib/share-api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleShareUpload(request);
}

export async function GET(request: Request) {
  return handleShareUpload(request);
}
