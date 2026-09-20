import { createElement, type ImgHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { PublicShare } from './public-share';
import { moveCarousel, PublicShareView } from './public-share-view';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
    unoptimized?: boolean;
  }) => createElement('img', props),
}));

const photos = [
  { id: 'one', caption: '바람이 머문 첫 장', focalPoint: { x: 0.25, y: 0.75 } },
  { id: 'two', caption: '' },
  { id: 'three' },
];
const genericShare: PublicShare = {
  curation: { includeProfile: false, photos },
  shareId: 'share_123',
  version: 1,
};

test('generic shares render one ordered, overflow-contained carousel without social actions', () => {
  const markup = renderToStaticMarkup(
    createElement(PublicShareView, { share: genericShare }),
  );

  expect(markup).toContain('max-w-[935px]');
  expect(markup).toContain('overflow-x-hidden');
  expect(markup).toContain('aria-roledescription="carousel"');
  expect(markup).toContain('overflow-hidden border-y');
  expect(markup).toContain('translateX(-0%)');
  expect(markup.match(/min-w-full/g)).toHaveLength(3);
  expect(markup).toContain('1 / 3 · 표지');
  expect(markup).toContain('이전 사진');
  expect(markup).toContain('다음 사진');
  expect(markup).toContain('1번째 공유 사진, 표지');
  expect(markup).toContain('바람이 머문 첫 장');
  expect(markup).toContain('/api/share/share_123/image/one');
  expect(markup).toContain('공유된 사진 흐름');
  expect(markup).not.toMatch(/좋아요|댓글|팔로워|Instagram|인스타그램/);
  expect(markup).not.toContain('must-not-appear');
});

test('profile identity renders only after explicit inclusion', () => {
  const profileShare: PublicShare = {
    ...genericShare,
    curation: {
      includeProfile: true,
      photos,
      profile: {
        avatarUrl: 'https://scontent.cdninstagram.com/avatar.webp',
        collectedAt: '2026-09-18T00:00:00.000Z',
        displayName: 'Diego',
        source: 'https://example.test/public-profile',
        username: 'diego.public',
      },
    },
  };
  const markup = renderToStaticMarkup(
    createElement(PublicShareView, { share: profileShare }),
  );
  if (!profileShare.curation.includeProfile)
    throw new Error('profile fixture must include identity');
  const { profile } = profileShare.curation;

  expect(markup).toContain('Diego');
  expect(markup).toContain('@diego.public');
  expect(markup).toContain('https://scontent.cdninstagram.com/avatar.webp');
  expect(markup).not.toContain(profile.source);
});

test('carousel movement reaches every position and stops at the ordered ends', () => {
  expect(moveCarousel(0, 3, -1)).toBe(0);
  expect(moveCarousel(0, 3, 1)).toBe(1);
  expect(moveCarousel(1, 3, 1)).toBe(2);
  expect(moveCarousel(2, 3, 1)).toBe(2);
  expect(moveCarousel(13, 15, 1)).toBe(14);
});
