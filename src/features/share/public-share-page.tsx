'use client';

import { useEffect, useState } from 'react';
import { loadPublicShare, type PublicShareLoadState } from './public-share';
import { PublicShareView } from './public-share-view';

export type PublicSharePageState = (
  | { type: 'loading' }
  | PublicShareLoadState
) & { shareId: string };

export function visibleShareState(
  state: PublicSharePageState,
  shareId: string,
): PublicSharePageState {
  return state.shareId === shareId ? state : { shareId, type: 'loading' };
}

export function PublicSharePage({ shareId }: { shareId: string }) {
  const [state, setState] = useState<PublicSharePageState>({
    shareId,
    type: 'loading',
  });
  const visibleState = visibleShareState(state, shareId);

  useEffect(() => {
    const controller = new AbortController();
    setState({ shareId, type: 'loading' });
    void loadPublicShare(shareId, fetch, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ ...result, shareId });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ shareId, type: 'error' });
      });
    return () => controller.abort();
  }, [shareId]);

  if (visibleState.type === 'ready')
    return <PublicShareView share={visibleState.share} />;
  if (visibleState.type === 'loading') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[935px] items-center justify-center px-5">
        <p role="status" className="text-sm text-muted-foreground">
          공유된 사진을 불러오고 있어요.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-[935px] items-center justify-center px-5 text-center">
      <section aria-labelledby="unavailable-title">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          GYEOL
        </p>
        <h1 id="unavailable-title" className="mt-3 text-xl font-semibold">
          이 공유를 볼 수 없어요.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          링크가 비활성화되었거나 잠시 열 수 없는 상태예요.
        </p>
      </section>
    </main>
  );
}
