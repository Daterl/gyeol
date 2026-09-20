import { expect, test } from 'vitest';
import { metadata } from './page';

test('public share pages are excluded from indexing and following', () => {
  expect(metadata.robots).toEqual({ follow: false, index: false });
});
