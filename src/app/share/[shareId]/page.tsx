import type { Metadata } from 'next';
import { PublicSharePage } from '@/features/share/public-share-page';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: '공유된 사진 흐름 — 결 GYEOL',
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  return <PublicSharePage shareId={(await params).shareId} />;
}
