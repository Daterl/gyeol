import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../../fixtures/interaction.sample.json';
import { RequestError } from '../../../../lib/interaction.js';
import {
  analysisCounters,
  resetAnalysisState,
} from '../../../../lib/photo_analysis.js';
import { handleProfileSession } from '../../../../lib/profile-session.js';
import { POST as feed } from '../feed/route';
import { GET, protectedAnalyze } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAnalysisState();
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

test('Next adapters reject invalid upload and obsolete optional-profile feed requests', async () => {
  expect((await GET(new Request('http://localhost/api/analyze'))).status).toBe(
    405,
  );
  expect(
    (
      await protectedAnalyze(
        new Request('https://gyeol.test/api/analyze', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization:
              'Bearer fixture-model-server-key-independent-32-characters',
          },
          body: '{}',
        }),
        {
          accessKey: 'fixture-model-server-key-independent-32-characters',
        },
      )
    ).status,
  ).toBe(400);
  const body = {
    schema_version: '1.0',
    session_id: 'adapter',
    photos: fixture.context.photos,
    identity: { target: { kind: 'none' }, current: { kind: 'none' } },
  };
  const response = await feed(
    new Request('http://localhost/api/feed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: { code: 'INVALID_REQUEST' },
  });
});

test('provider-disabled analysis stays heuristic without outbound calls', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'configured-but-disabled');
  vi.stubEnv('GYEOL_MODEL_PROVIDER_ENABLED', 'true');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const bytes = await readFile(
    new URL(
      '../../../../fixtures/jpeg/solid_white_baseline.jpg',
      import.meta.url,
    ),
  );
  const response = await protectedAnalyze(
    new Request(`${origin}/api/analyze`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await browserHeaders()),
      },
      body: JSON.stringify({
        schema_version: '1.0',
        session_id: 'provider-gate',
        collection: 'selected',
        photo_id: 'provider-gate-photo',
        input_index: 0,
        file_ref: 'solid-white.jpg',
        media_type: 'image/jpeg',
        image_base64: bytes.toString('base64'),
      }),
    }),
    { browser, limiter: { take: async () => expect.unreachable() } },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-gyeol-analysis-reason')).toBe(
    'provider_disabled',
  );
  expect(await response.json()).toMatchObject({ analysis_source: 'heuristic' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(analysisCounters().modelCalls).toBe(0);
});

test('paid analysis rejects missing capability and exhausted budget before provider calls', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'configured');
  vi.stubEnv('GYEOL_MODEL_PROVIDER_ENABLED', '1');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const bytes = await readFile(
    new URL(
      '../../../../fixtures/jpeg/solid_white_baseline.jpg',
      import.meta.url,
    ),
  );
  const body = JSON.stringify({
    schema_version: '1.0',
    session_id: 'denied-analysis',
    collection: 'selected',
    photo_id: 'denied-photo',
    input_index: 0,
    file_ref: 'solid-white.jpg',
    media_type: 'image/jpeg',
    image_base64: bytes.toString('base64'),
  });
  const request = (authorization?: string) =>
    new Request('https://gyeol.test/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body,
    });
  expect((await protectedAnalyze(request())).status).toBe(503);
  const accessKey = 'fixture-model-server-key-independent-32-characters';
  expect(
    (
      await protectedAnalyze(request('Bearer wrong'), {
        accessKey,
        limiter: { take: async () => expect.unreachable() },
      })
    ).status,
  ).toBe(401);
  const limited = await protectedAnalyze(request(`Bearer ${accessKey}`), {
    accessKey,
    limiter: {
      take: async () => {
        throw Object.assign(
          new RequestError('RATE_LIMITED', 429, 'later', true),
          { retryAfter: 42 },
        );
      },
    },
  });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('42');
  expect(fetcher).not.toHaveBeenCalled();
  expect(analysisCounters().modelCalls).toBe(0);
});

test('signed browser capability and remaining budget reach paid analysis', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'configured');
  vi.stubEnv('GYEOL_MODEL_PROVIDER_ENABLED', '1');
  const bytes = await readFile(
    new URL(
      '../../../../fixtures/jpeg/solid_white_baseline.jpg',
      import.meta.url,
    ),
  );
  const observation = {
    color: {
      hue_mean: 0,
      sat_mean: 0,
      bright_mean: 1,
      palette_hex: ['#ffffff'],
    },
    composition: 'full_frame',
    scale: 'midshot',
    subjects: [],
    has_face: false,
    text_in_image: null,
    describable_facts: ['흰 면'],
    quality_flags: [],
  };
  const fetcher = vi.fn(async (url: string | URL) =>
    String(url).includes('/models/')
      ? Response.json({
          id: 'test-model',
          capabilities: {
            image_input: { supported: true },
            structured_outputs: { supported: true },
          },
        })
      : Response.json({
          model: 'test-model',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(observation) }],
        }),
  );
  vi.stubGlobal('fetch', fetcher);
  const admissions: [string, string | undefined][] = [];
  const response = await protectedAnalyze(
    new Request(`${origin}/api/analyze`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await browserHeaders()),
      },
      body: JSON.stringify({
        schema_version: '1.0',
        session_id: 'paid-browser-analysis',
        collection: 'selected',
        photo_id: 'paid-photo',
        input_index: 0,
        file_ref: 'solid-white.jpg',
        media_type: 'image/jpeg',
        image_base64: bytes.toString('base64'),
      }),
    }),
    {
      browser,
      limiter: {
        take: async (action, sessionId) => {
          admissions.push([action, sessionId]);
        },
      },
    },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-gyeol-analysis-source')).toBe('vision_model');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(admissions).toHaveLength(1);
  expect(admissions[0]?.[0]).toBe('model');
  expect(admissions[0]?.[1]).toMatch(/^[a-f0-9]{64}$/);
  expect(admissions[0]?.[1]).not.toBe('paid-browser-analysis');
});
