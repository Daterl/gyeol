import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../../fixtures/interaction.sample.json';
import { RequestError } from '../../../../lib/interaction.js';
import { handleProfileSession } from '../../../../lib/profile-session.js';
import { GET, protectedGenerate } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const origin = 'https://gyeol.test';
const browser = {
  origin,
  secret: 'fixture-browser-secret-independent-32-characters',
  now: () => 1789732800000,
};
async function browserHeaders() {
  const response = await handleProfileSession(
    new Request(`${origin}/api/profile/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        'sec-fetch-site': 'same-origin',
      },
      body: '{}',
    }),
    { ...browser, limiter: { take: async () => {} } },
  );
  const value = await response.json();
  return {
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
    origin,
    'sec-fetch-site': 'same-origin',
    'x-gyeol-csrf': value.csrfToken,
  };
}
test('Next Node adapter rejects unsupported methods and missing-key generation without network', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(new Request('http://localhost/api/generate'))).status).toBe(
    405,
  );
  for (const mode of ['all', 'slot']) {
    const body = {
      schema_version: '1.0',
      mode,
      feed: fixture.feed,
      context: fixture.context,
      ...(mode === 'slot' ? { photo_id: 'ph_01' } : {}),
    };
    const accessKey = 'fixture-model-server-key-independent-32-characters';
    const result = await protectedGenerate(
      new Request('https://gyeol.test/api/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify(body),
      }),
      { accessKey },
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({
      error: { code: 'GENERATION_UNAVAILABLE', retryable: false },
    });
  }
  expect(fetcher).not.toHaveBeenCalled();
});

test('provider-disabled generation fails closed without outbound calls', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'configured-but-disabled');
  vi.stubEnv('GYEOL_MODEL_PROVIDER_ENABLED', 'true');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const response = await protectedGenerate(
    new Request(`${origin}/api/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await browserHeaders()),
      },
      body: JSON.stringify({
        schema_version: '1.0',
        mode: 'all',
        feed: fixture.feed,
        context: fixture.context,
      }),
    }),
    { browser, limiter: { take: async () => expect.unreachable() } },
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: { code: 'GENERATION_UNAVAILABLE', retryable: false },
  });
  expect(fetcher).not.toHaveBeenCalled();
});

test('paid generation rejects unauthorized and limiter failure before provider calls', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'configured');
  vi.stubEnv('GYEOL_MODEL_PROVIDER_ENABLED', '1');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const request = (authorization?: string) =>
    new Request('https://gyeol.test/api/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({
        schema_version: '1.0',
        mode: 'all',
        feed: fixture.feed,
        context: fixture.context,
      }),
    });
  expect((await protectedGenerate(request())).status).toBe(503);
  const accessKey = 'fixture-model-server-key-independent-32-characters';
  expect(
    (
      await protectedGenerate(request(`Bearer ${accessKey}`), {
        accessKey,
        limiter: { take: async () => Promise.reject(new Error('storage')) },
      })
    ).status,
  ).toBe(503);
  const limited = await protectedGenerate(request(`Bearer ${accessKey}`), {
    accessKey,
    limiter: {
      take: async () => {
        throw Object.assign(
          new RequestError('RATE_LIMITED', 429, 'later', true),
          { retryAfter: 37 },
        );
      },
    },
  });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('37');
  expect(fetcher).not.toHaveBeenCalled();
});

test('signed browser capability and remaining budget reach paid generation', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'configured');
  vi.stubEnv('GYEOL_MODEL_PROVIDER_ENABLED', '1');
  const fetcher = vi.fn(async (url: string | URL) =>
    String(url).includes('/models/')
      ? Response.json({
          id: 'test-model',
          capabilities: { structured_outputs: { supported: true } },
        })
      : Response.json({
          model: 'test-model',
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text: JSON.stringify({ output: fixture.all_omitted }),
            },
          ],
        }),
  );
  vi.stubGlobal('fetch', fetcher);
  const response = await protectedGenerate(
    new Request(`${origin}/api/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await browserHeaders()),
      },
      body: JSON.stringify({
        schema_version: '1.0',
        mode: 'all',
        feed: fixture.feed,
        context: fixture.context,
      }),
    }),
    { browser, limiter: { take: async () => {} } },
  );
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
