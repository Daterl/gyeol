import { expect, test } from 'vitest';
import type { ConfirmedCuration } from '../editor/curation-store';
import type { SelectedPhoto } from '../editor/store';
import { sharePhotosFor } from './share-controls';

test('share photos follow the immutable confirmation order', async () => {
  const confirmed = {
    crops: {},
    excluded: [],
    output: {
      title: '기록',
      slots: [
        {
          caption_state: 'omitted',
          omit_reason: '사진만으로 충분함',
          photo_id: 'second',
          position: 1,
          text: null,
        },
        {
          caption_state: 'omitted',
          omit_reason: '사진만으로 충분함',
          photo_id: 'first',
          position: 2,
          text: null,
        },
      ],
    },
    profileSharing: false,
  } satisfies ConfirmedCuration;
  const selected = [
    { photo_id: 'first', file: new File(['first'], 'first.webp'), url: '' },
    { photo_id: 'second', file: new File(['second'], 'second.webp'), url: '' },
  ] satisfies SelectedPhoto[];

  const photos = await sharePhotosFor(confirmed, selected);

  expect(photos.map(({ id }) => id)).toEqual(['second', 'first']);
  expect(new TextDecoder().decode(photos[0].body)).toBe('second');
});
