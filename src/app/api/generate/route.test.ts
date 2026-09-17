import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../../fixtures/interaction.sample.json';
import { GET, POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
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
    const result = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({
      error: { code: 'GENERATION_UNAVAILABLE', retryable: false },
    });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
