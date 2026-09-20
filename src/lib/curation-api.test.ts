import { afterEach, expect, test, vi } from 'vitest';
import { curationFixture } from '../features/editor/curation-test-fixture';
import { createProfileClient, curatePhotos } from './api';

afterEach(() => vi.unstubAllGlobals());
const session = () =>
  Response.json({ csrfToken: 'csrf-test', expires_at: Date.now() + 60000 });
const publicProfile = () =>
  Response.json({
    status: 'public',
    snapshotId: 'test-reference',
    expires_at: Date.now() + 60000,
    refresh_required: false,
  });
const status = {
  action: 'status',
  schema_version: '1.0',
  profile_url: 'https://www.instagram.com/public_example/',
} as const;
test('browser session keeps credentials same-origin, uses CSRF and reboots once on 401 without a server credential', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(
      Response.json(
        {
          error: { code: 'UNAUTHORIZED', message: 'expired', retryable: false },
        },
        { status: 401 },
      ),
    )
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(publicProfile());
  vi.stubGlobal('fetch', fetcher);
  expect((await createProfileClient()(status)).status).toBe('public');
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/api/profile/session',
    '/api/profile',
    '/api/profile/session',
    '/api/profile',
  ]);
  for (const [, init] of fetcher.mock.calls) {
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).not.toHaveProperty('Authorization');
  }
  expect(fetcher.mock.calls[1][1].headers['X-Gyeol-CSRF']).toBe('csrf-test');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty(
    'confirmLive',
  );
});
test('rate limit and unavailable responses fail without retrying or starting collection', async () => {
  for (const code of [429, 503]) {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'UNAVAILABLE', message: 'later', retryable: true } },
          { status: code, headers: { 'Retry-After': '45' } },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(createProfileClient()(status)).rejects.toMatchObject({
      status: code,
      retryAfter: 45,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
test('malformed public success never unlocks photos', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(
        Response.json({ status: 'public', refresh_required: false }),
      ),
  );
  await expect(createProfileClient()(status)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
test('curation validates profile and photo identities and projects feed for strict legacy validation', async () => {
  const result = curationFixture();
  const request = {
    schema_version: '1.0' as const,
    session_id: result.feed.session_id,
    photos: result.context.photos,
    profile_url: result.curation.profile.source_url,
    profile_snapshot_id: result.curation.profile_snapshot_id,
    prompt: '',
  };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result));
  vi.stubGlobal('fetch', fetcher);
  expect((await curatePhotos(request)).curation.profile_snapshot_id).toBe(
    request.profile_snapshot_id,
  );
  fetcher.mockResolvedValueOnce(
    Response.json({
      ...result,
      curation: { ...result.curation, profile_snapshot_id: 'another-profile' },
    }),
  );
  await expect(curatePhotos(request)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

test('malformed exclusion evidence fails before rendering the preview', async () => {
  const result = curationFixture();
  const request = {
    schema_version: '1.0' as const,
    session_id: result.feed.session_id,
    photos: result.context.photos,
    profile_url: result.curation.profile.source_url,
    profile_snapshot_id: result.curation.profile_snapshot_id,
  };
  const malformed = JSON.parse(JSON.stringify(result));
  malformed.curation.slots[0].exclusion_candidate.evidence = null;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(malformed)));
  await expect(curatePhotos(request)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
