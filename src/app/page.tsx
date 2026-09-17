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
        className="absolute -top-20 left-4 z-50 rounded-lg bg-ink px-4 py-3 text-paper focus:top-3"
        href="#main"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-16 max-w-6xl items-baseline gap-2 px-5 py-4">
          <span className="text-xl font-bold">결</span>
          <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            GYEOL
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            나다운 피드의 시작
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16" id="main">
        <div className="max-w-3xl py-10 sm:py-14">
          <p className="mb-4 font-mono text-xs tracking-[0.16em] text-accent">
            사진은 그대로, 흐름은 나답게
          </p>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-[40px]">
            올리고 싶은 사진들,
            <br />
            어떤 결로 이어볼까요?
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            사진을 보정하지 않습니다. 어떤 순서로, 뭐라고 열고,
            <br className="hidden sm:block" />
            어디에 말을 붙일지 함께 고릅니다.
          </p>
        </div>
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
