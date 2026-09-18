import { PhotoInput } from '../features/input/photo-input';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mock?: string | string[] }>;
}) {
  const mock = (await searchParams).mock === '1';
  return (
    <>
      <a
        className="absolute -top-20 left-[max(1rem,env(safe-area-inset-left))] z-50 rounded-lg bg-ink px-4 py-3 text-paper focus:top-[max(0.75rem,env(safe-area-inset-top))]"
        href="#main"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-6xl items-baseline gap-2 py-4 pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]">
          <span className="text-xl font-bold">결</span>
          <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            GYEOL
          </span>
          <span className="ml-auto hidden text-xs text-muted-foreground min-[360px]:block">
            나다운 피드의 시작
          </span>
        </div>
      </header>
      <main
        className="mx-auto max-w-6xl pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(4rem+env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]"
        id="main"
      >
        <PhotoInput mock={mock} />
        <p className="mt-7 text-center text-sm leading-7 text-muted-foreground">
          말을 덜어내도 괜찮아요.
          <br />
          결과는 제안이고, 마지막 선택은 당신의 몫입니다.
        </p>
      </main>
    </>
  );
}
