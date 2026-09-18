import { handleShare } from '../../../../../lib/share-api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ shareId: string }> };

export async function GET(request: Request, { params }: Context) {
  return handleShare(request, { shareId: (await params).shareId });
}

export async function POST(request: Request, { params }: Context) {
  return handleShare(request, { shareId: (await params).shareId });
}
