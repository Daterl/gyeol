import { createElement, type ImgHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { PublicShare } from './public-share';
import { PublicShareView, SharePhotoDetail } from './public-share-view';

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

vi.mock('radix-ui', () => ({
  Dialog: {
    Close: ({ children }: { children?: ReactNode }) => children,
    Content: ({ children }: { children?: ReactNode }) => children,
    Description: ({ children }: { children?: ReactNode }) => children,
    Overlay: () => null,
    Portal: ({ children }: { children?: ReactNode }) => children,
    Root: ({ children }: { children?: ReactNode }) => children,
    Title: ({ children }: { children?: ReactNode }) => children,
    Trigger: ({ children }: { children?: ReactNode }) => children,
  },
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

test('generic shares keep a mobile three-column grid and expose no profile PII or social actions', () => {
  const markup = renderToStaticMarkup(
    createElement(PublicShareView, { share: genericShare }),
  );

  expect(markup).toContain('max-w-[935px]');
  expect(markup).toContain('grid-cols-3');
  expect(markup.match(/aspect-square/g)).toHaveLength(3);
  expect(markup).toContain('1번째 사진 상세 보기');
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

test('the keyboard dialog detail uses the uncropped image route and renders caption states', () => {
  const captioned = renderToStaticMarkup(
    createElement(SharePhotoDetail, {
      index: 0,
      photo: photos[0],
      shareId: genericShare.shareId,
    }),
  );
  const empty = renderToStaticMarkup(
    createElement(SharePhotoDetail, {
      index: 1,
      photo: photos[1],
      shareId: genericShare.shareId,
    }),
  );

  expect(captioned).toContain('object-contain');
  expect(captioned).toContain('바람이 머문 첫 장');
  expect(captioned).toContain('/api/share/share_123/image/one');
  expect(empty).toContain('캡션 없이 공유했어요.');
});
