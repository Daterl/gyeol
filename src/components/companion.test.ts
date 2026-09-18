import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { Companion } from './companion';

const mock = vi.hoisted(() => ({
  reduced: false as boolean | null,
  effects: [] as Array<() => (() => void) | undefined>,
  animate: vi.fn(),
  stop: vi.fn(),
  scope: { current: {} },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => (() => void) | undefined) =>
    mock.effects.push(effect),
}));
vi.mock('motion/react', () => ({
  MotionConfig: ({ children }: { children: unknown }) => children,
  useReducedMotion: () => mock.reduced,
  useAnimate: () => [mock.scope, mock.animate],
}));
beforeEach(() => {
  mock.effects = [];
  mock.animate.mockReset().mockReturnValue({ stop: mock.stop });
  mock.stop.mockClear();
});
test('motion is bounded, reduced or unknown preference is static, and cleanup cancels the previous animation', () => {
  for (const reduced of [false, true, null]) {
    mock.reduced = reduced;
    const markup = renderToStaticMarkup(
      createElement(Companion, { state: 'working' }),
    );
    expect(markup).toContain('/working.webp');
    expect(markup).not.toContain('opacity:0');
    const cleanup = mock.effects.pop()?.();
    expect(mock.animate).toHaveBeenLastCalledWith(
      mock.scope.current,
      reduced === false
        ? { opacity: [0.8, 1], y: [4, 0] }
        : { opacity: 1, y: 0 },
      { duration: reduced === false ? 0.18 : 0, ease: 'easeOut' },
    );
    cleanup?.();
  }
  expect(mock.stop).toHaveBeenCalledTimes(3);
});
