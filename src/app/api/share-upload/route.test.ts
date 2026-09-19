import { expect, test } from 'vitest';
import { GET as GET_MANAGE } from '../manage/[shareId]/route';
import { GET as GET_IMAGE } from '../share/[shareId]/image/[photoId]/route';
import { GET as GET_SHARE } from '../share/[shareId]/route';
import { GET, POST } from './route';

test('share routes fail closed with no live Blob adapter and never cache errors', async () => {
  const upload = await POST(
    new Request('http://localhost/api/share-upload', {
      method: 'POST',
      body: JSON.stringify({ action: 'start', photos: [] }),
    }),
  );
  expect(upload.status).toBe(503);
  expect(upload.headers.get('cache-control')).toBe('no-store');
  expect(
    (await GET(new Request('http://localhost/api/share-upload'))).status,
  ).toBe(503);

  const context = { params: Promise.resolve({ shareId: 'share' }) };
  expect(
    (await GET_SHARE(new Request('http://localhost/api/share/share'), context))
      .status,
  ).toBe(503);
  expect(
    (
      await GET_MANAGE(
        new Request('http://localhost/api/manage/share'),
        context,
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await GET_IMAGE(
        new Request('http://localhost/api/share/share/image/photo'),
        { params: Promise.resolve({ shareId: 'share', photoId: 'photo' }) },
      )
    ).status,
  ).toBe(503);
});
