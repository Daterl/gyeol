import { handleIngest } from '../../../../lib/ingest_api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleIngest(request);
}
