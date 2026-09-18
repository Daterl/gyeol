import { afterEach, expect, test, vi } from 'vitest';
import { GET, POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('profile route rejects non-POST, missing configuration, and missing authorization without provider access', async () => {
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No network'));
  expect((await GET(new Request('http://localhost/api/profile'))).status).toBe(
    405,
  );
  const request = () =>
    new Request('http://localhost/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  vi.stubEnv('APIFY_INGEST_ACCESS_KEY', '');
  expect((await POST(request())).status).toBe(503);
  vi.stubEnv(
    'APIFY_INGEST_ACCESS_KEY',
    'fixture-only-access-key-32-characters',
  );
  expect((await POST(request())).status).toBe(401);
  expect(network).not.toHaveBeenCalled();
});
