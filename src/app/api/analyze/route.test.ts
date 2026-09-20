import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../../fixtures/interaction.sample.json';
import { POST as feed } from '../feed/route';
import { GET, POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('Next adapters reject invalid upload and obsolete optional-profile feed requests', async () => {
  expect((await GET(new Request('http://localhost/api/analyze'))).status).toBe(
    405,
  );
  expect(
    (
      await POST(
        new Request('http://localhost/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
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
  const response = await POST(
    new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-gyeol-analysis-reason')).toBe(
    'provider_disabled',
  );
  expect(await response.json()).toMatchObject({ analysis_source: 'heuristic' });
  expect(fetcher).not.toHaveBeenCalled();
});
