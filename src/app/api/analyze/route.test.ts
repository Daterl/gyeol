import { expect, test } from 'vitest';
import fixture from '../../../../fixtures/interaction.sample.json';
import { POST as feed } from '../feed/route';
import { GET, POST } from './route';

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
