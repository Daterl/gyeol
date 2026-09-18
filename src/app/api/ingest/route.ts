import { handleIngest } from '../../../../lib/ingest_api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleIngest(request);
}

export async function GET(request: Request) {
  return handleIngest(request);
}

export async function PUT(request: Request) {
  return handleIngest(request);
}

export async function DELETE(request: Request) {
  return handleIngest(request);
}
