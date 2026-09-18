'use client';

import { MotionConfig, useAnimate, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useEffect } from 'react';

export function Companion({
  state,
}: {
  state: 'default' | 'working' | 'complete' | 'recovery';
}) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  useEffect(() => {
    if (!scope.current) return;
    const animation = animate(
      scope.current,
      reduce === false
        ? { opacity: [0.8, 1], y: [state === 'working' ? 4 : 2, 0] }
        : { opacity: 1, y: 0 },
      { duration: reduce === false ? 0.18 : 0, ease: 'easeOut' },
    );
    return () => animation.stop();
  }, [animate, reduce, scope, state]);
  return (
    <MotionConfig reducedMotion="user">
      <span
        aria-hidden="true"
        className="hidden size-16 shrink-0 min-[360px]:block sm:size-24"
      >
        <span ref={scope} className="block size-full">
          <Image
            src={`/images/gyeol-character/${state}.webp`}
            alt=""
            width={96}
            height={96}
            unoptimized
            className="size-full object-contain"
          />
        </span>
      </span>
    </MotionConfig>
  );
}
