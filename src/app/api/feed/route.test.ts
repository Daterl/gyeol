import { describe, expect, it, vi } from 'vitest';
import expectedFeed from '../../../../fixtures/ordered_feed.sample.json';
import { GET, HEAD, OPTIONS, POST } from './route';

describe('Next.js foundation HTTP adapter', () => {
  it('preserves the raw feed, no-store and all resources without a network call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network'));
    try {
      const response = await GET(
        new Request('http://localhost/api/feed?mock=1'),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual(expectedFeed);
      for (const resource of [
        'photo_analysis',
        'target_profile',
        'current_profile',
      ]) {
        const result = await GET(
          new Request(`http://localhost/api/feed?mock=1&resource=${resource}`),
        );
        expect(result.status).toBe(200);
        expect(Array.isArray(await result.json())).toBe(true);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    ['', 501, 'LIVE_NOT_IMPLEMENTED'],
    ['?mock=0', 400, 'INVALID_MOCK'],
    ['?mock=1&mock=1', 400, 'INVALID_MOCK'],
    ['?mock=1&resource=unknown', 400, 'INVALID_RESOURCE'],
    [
      '?mock=1&resource=target_profile&resource=current_profile',
      400,
      'INVALID_RESOURCE',
    ],
  ])('keeps errors explicit for %s', async (query, status, code) => {
    const response = await GET(
      new Request(`http://localhost/api/feed${query}`),
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('preserves method rejection and omits the HTTP HEAD body', async () => {
    for (const [method, call] of [
      ['POST', POST],
      ['OPTIONS', OPTIONS],
    ] as const) {
      const response = await call(
        new Request('http://localhost/api/feed?mock=1', { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
      expect(await response.json()).toEqual({
        error: { code: 'METHOD_NOT_ALLOWED' },
      });
    }
    const head = await HEAD(
      new Request('http://localhost/api/feed?mock=1', { method: 'HEAD' }),
    );
    expect(head.status).toBe(405);
    expect(await head.text()).toBe('');
  });
});
