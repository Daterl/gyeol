import { expect, test } from 'vitest';
import type { PublicShare } from './public-share';
import {
  type PublicSharePageState,
  visibleShareState,
} from './public-share-page';

const share: PublicShare = {
  curation: {
    includeProfile: false,
    photos: [{ id: 'one' }, { id: 'two' }, { id: 'three' }],
  },
  shareId: 'share_a',
  version: 1,
};

test('a route transition hides the previous ready share before the next effect runs', () => {
  const previous: PublicSharePageState = {
    share,
    shareId: 'share_a',
    type: 'ready',
  };

  expect(visibleShareState(previous, 'share_a')).toBe(previous);
  expect(visibleShareState(previous, 'share_b')).toEqual({
    shareId: 'share_b',
    type: 'loading',
  });
  expect(visibleShareState(previous, 'share_b')).not.toHaveProperty('share');
});
