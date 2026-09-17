import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata: Metadata = {
  description: '올릴 사진의 순서와 말을 붙일 자리를 근거와 함께 제안합니다.',
  title: '결 GYEOL — 사진 사이에, 나다운 흐름',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
