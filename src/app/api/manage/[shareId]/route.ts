import { handleManage } from '../../../../../lib/share-api.js';
import { getShareService } from '../../../../../lib/share-runtime.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ shareId: string }> };

export async function POST(request: Request, { params }: Context) {
  return handleManage(request, {
    service: getShareService(),
    shareId: (await params).shareId,
  });
}

export async function GET(request: Request, { params }: Context) {
  return handleManage(request, {
    service: getShareService(),
    shareId: (await params).shareId,
  });
}
