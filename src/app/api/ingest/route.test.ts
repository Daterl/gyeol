import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST, PUT } from './route';

const accessKey = 'route-test-access-key-at-least-32-characters';
const request = (method: string) =>
  new Request('http://localhost/api/ingest', {
    method,
    headers: { authorization: `Bearer ${accessKey}` },
  });

describe('/api/ingest unsupported methods', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [GET, 'GET'],
    [PUT, 'PUT'],
    [DELETE, 'DELETE'],
  ] as const)(
    'returns the documented JSON 405 through the actual route export',
    async (handler, method) => {
      vi.stubEnv('APIFY_INGEST_ACCESS_KEY', accessKey);
      const response = await handler(request(method));
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        error: { code: 'METHOD_NOT_ALLOWED' },
      });
    },
  );

  it('fails closed before a billable start when no durable ledger is configured', async () => {
    vi.stubEnv('APIFY_INGEST_ACCESS_KEY', accessKey);
    const response = await POST(
      new Request('http://localhost/api/ingest', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessKey}`,
          'idempotency-key': 'route-start-request-0001',
        },
        body: JSON.stringify({
          action: 'start',
          confirmLive: true,
          url: 'https://www.instagram.com/public_account/',
        }),
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_CONFIGURED' },
    });
  });
});
