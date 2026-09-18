import { handleShare } from '../../../../../../../lib/share-api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ shareId: string; photoId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { shareId, photoId } = await params;
  return handleShare(request, { shareId, photoId });
}

export async function POST(request: Request, { params }: Context) {
  const { shareId, photoId } = await params;
  return handleShare(request, { shareId, photoId });
}
