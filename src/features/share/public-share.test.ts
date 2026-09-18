import { expect, test, vi } from 'vitest';
import {
  loadPublicShare,
  parsePublicShare,
  publicImageUrl,
} from './public-share';

const genericShare = {
  shareId: 'share_123',
  version: 2,
  curation: {
    includeProfile: false,
    photos: [
      { id: 'first', caption: '첫 장', focalPoint: { x: 0.2, y: 0.8 } },
      { id: 'second', caption: '' },
      { id: 'third' },
    ],
  },
};

test('the public loader consumes the G6 route without caching and validates the share identity', async () => {
  const fetcher = vi.fn(async () => Response.json(genericShare));
  const state = await loadPublicShare('share_123', fetcher);

  expect(state).toEqual({ type: 'ready', share: genericShare });
  expect(fetcher).toHaveBeenCalledWith('/api/share/share_123', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: undefined,
  });
  expect(publicImageUrl('share_123', 'first')).toBe(
    '/api/share/share_123/image/first',
  );
  expect(
    parsePublicShare({ ...genericShare, shareId: 'another' }, 'share_123'),
  ).toBeNull();
});

test.each([404, 410])(
  'status %s becomes one content-free unavailable state',
  async (status) => {
    const json = vi.fn(async () => ({ privateCaption: 'do not read' }));
    const fetcher = vi.fn(async () =>
      Object.assign(new Response(null, { status }), { json }),
    );

    await expect(loadPublicShare('share_123', fetcher)).resolves.toEqual({
      type: 'unavailable',
    });
    expect(json).not.toHaveBeenCalled();
  },
);

test('invalid or contradictory profile payloads never reach the view', () => {
  expect(
    parsePublicShare(
      {
        ...genericShare,
        curation: {
          ...genericShare.curation,
          profile: { username: 'must-not-leak' },
        },
      },
      'share_123',
    ),
  ).toBeNull();
  expect(
    parsePublicShare(
      {
        ...genericShare,
        curation: {
          includeProfile: true,
          photos: genericShare.curation.photos,
          profile: {
            avatarUrl: 'http://insecure.example/avatar.jpg',
            collectedAt: 'not-a-date',
            displayName: 'Hidden',
            source: 'fixture',
            username: 'private user',
          },
        },
      },
      'share_123',
    ),
  ).toBeNull();
});

test('only profile CDN avatars survive validation; arbitrary tracking URLs become a local fallback', () => {
  const withAvatar = (avatarUrl: string) => ({
    ...genericShare,
    curation: {
      includeProfile: true,
      photos: genericShare.curation.photos,
      profile: {
        avatarUrl,
        collectedAt: '2026-09-18T00:00:00.000Z',
        displayName: 'Public profile',
        source: 'fixture',
        username: 'public.profile',
      },
    },
  });
  const allowed = parsePublicShare(
    withAvatar('https://scontent.cdninstagram.com/avatar.webp?token=signed'),
    'share_123',
  );
  const tracking = parsePublicShare(
    withAvatar('https://tracker.example/visitor.gif'),
    'share_123',
  );

  expect(allowed?.curation.includeProfile).toBe(true);
  if (!allowed?.curation.includeProfile) throw new Error('profile expected');
  expect(allowed.curation.profile.avatarUrl).toContain('cdninstagram.com');
  expect(tracking?.curation.includeProfile).toBe(true);
  if (!tracking?.curation.includeProfile) throw new Error('profile expected');
  expect(tracking.curation.profile.avatarUrl).toBeNull();
});

test('transport failures and malformed successful responses expose no partial share', async () => {
  await expect(
    loadPublicShare('share_123', async () => {
      throw new Error('offline');
    }),
  ).resolves.toEqual({ type: 'error' });
  await expect(
    loadPublicShare('share_123', async () =>
      Response.json({ ...genericShare, curation: null }),
    ),
  ).resolves.toEqual({ type: 'error' });
  await expect(
    loadPublicShare('../manifest', async () => Response.json(genericShare)),
  ).resolves.toEqual({ type: 'unavailable' });
});
