import { afterEach, expect, test, vi } from 'vitest';
import { GET, POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('browser bootstrap fails closed before storage when configuration or origin is invalid', async () => {
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No network'));
  expect(
    (await GET(new Request('https://gyeol.test/api/profile/session'))).status,
  ).toBe(405);
  const request = (origin: string) =>
    new Request('https://gyeol.test/api/profile/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        'sec-fetch-site': 'same-origin',
      },
      body: '{}',
    });
  vi.stubEnv('GYEOL_BROWSER_SESSION_SECRET', '');
  expect((await POST(request('https://gyeol.test'))).status).toBe(503);
  vi.stubEnv(
    'GYEOL_BROWSER_SESSION_SECRET',
    'fixture-browser-secret-at-least-32',
  );
  vi.stubEnv('GYEOL_APP_ORIGIN', 'https://gyeol.test');
  expect((await POST(request('https://evil.test'))).status).toBe(403);
  expect(network).not.toHaveBeenCalled();
});
