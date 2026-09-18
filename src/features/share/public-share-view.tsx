'use client';

import Image from 'next/image';
import { Dialog } from 'radix-ui';
import { useId, useRef, useState } from 'react';
import type { PublicShare, PublicSharePhoto } from './public-share';
import { publicImageUrl } from './public-share';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="m6 6 12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function GenericHeader() {
  return (
    <div className="flex min-h-20 items-center gap-2 px-4">
      <span className="text-xl font-bold">결</span>
      <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
        GYEOL
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        공유된 사진 흐름
      </span>
    </div>
  );
}

function ProfileHeader({ share }: { share: PublicShare }) {
  if (!share.curation.includeProfile) return <GenericHeader />;
  const { profile } = share.curation;
  return (
    <div className="flex min-h-24 items-center gap-3 px-4">
      {profile.avatarUrl ? (
        <Image
          src={profile.avatarUrl}
          alt=""
          width={56}
          height={56}
          referrerPolicy="no-referrer"
          className="size-14 rounded-full border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent"
        >
          {profile.username.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">
          {profile.displayName ?? profile.username}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          @{profile.username}
        </p>
      </div>
      <span className="ml-auto font-mono text-xs tracking-[0.2em] text-muted-foreground">
        GYEOL
      </span>
    </div>
  );
}

export function SharePhotoDetail({
  index,
  photo,
  shareId,
}: {
  index: number;
  photo: PublicSharePhoto;
  shareId: string;
}) {
  return (
    <div>
      <div className="relative flex min-h-[45dvh] max-h-[72dvh] items-center justify-center bg-black">
        <Image
          src={publicImageUrl(shareId, photo.id)}
          alt={`${index + 1}번째 공유 사진`}
          fill
          priority
          unoptimized
          sizes="(min-width: 768px) 760px, 100vw"
          className="object-contain"
        />
      </div>
      <div className="border-t border-line bg-card px-5 py-4">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
          {String(index + 1).padStart(2, '0')}
        </p>
        {photo.caption ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {photo.caption}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            캡션 없이 공유했어요.
          </p>
        )}
      </div>
    </div>
  );
}

export function PublicShareView({ share }: { share: PublicShare }) {
  const dialogId = useId();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeTriggerId = useRef<string | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const selected =
    selectedIndex === null ? null : share.curation.photos[selectedIndex];

  return (
    <Dialog.Root
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedIndex(null);
      }}
    >
      <a
        className="absolute -top-20 left-4 z-50 rounded-lg bg-ink px-4 py-3 text-paper focus:top-3"
        href="#shared-grid"
      >
        사진 목록으로 건너뛰기
      </a>
      <main className="mx-auto min-h-dvh w-full max-w-[935px] pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <ProfileHeader share={share} />
        <h1 className="sr-only">공유된 사진 흐름</h1>
        <ol
          id="shared-grid"
          aria-label={`${share.curation.photos.length}장의 공유 사진`}
          className="grid grid-cols-3 gap-0.5 sm:gap-1"
        >
          {share.curation.photos.map((photo, index) => (
            <li key={photo.id} className="min-w-0">
              <button
                ref={(element) => {
                  if (element) triggers.current.set(photo.id, element);
                  else triggers.current.delete(photo.id);
                }}
                type="button"
                onClick={() => {
                  activeTriggerId.current = photo.id;
                  setSelectedIndex(index);
                }}
                aria-controls={dialogId}
                aria-expanded={selectedIndex === index}
                aria-haspopup="dialog"
                aria-label={`${index + 1}번째 사진 상세 보기`}
                className="group relative block aspect-square w-full overflow-hidden bg-line-soft"
              >
                <Image
                  src={publicImageUrl(share.shareId, photo.id)}
                  alt=""
                  fill
                  unoptimized
                  sizes="(min-width: 935px) 310px, 33vw"
                  style={
                    photo.focalPoint
                      ? {
                          objectPosition: `${photo.focalPoint.x * 100}% ${photo.focalPoint.y * 100}%`,
                        }
                      : undefined
                  }
                  className="object-cover transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </button>
            </li>
          ))}
        </ol>
        <footer className="px-5 pt-8 text-center text-xs text-muted-foreground">
          결로 정리한 사진 흐름
        </footer>
      </main>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150" />
        <Dialog.Content
          id={dialogId}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const id = activeTriggerId.current;
            if (id) triggers.current.get(id)?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[min(100%-1rem,48rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/10 bg-card shadow-2xl focus:outline-none motion-safe:data-[state=closed]:scale-[0.98] motion-safe:data-[state=closed]:opacity-0 motion-safe:data-[state=open]:scale-100 motion-safe:data-[state=open]:opacity-100 motion-safe:transition motion-safe:duration-150"
        >
          <Dialog.Title className="sr-only">
            {selectedIndex === null
              ? '사진 상세'
              : `${selectedIndex + 1}번째 사진 상세`}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            원본 비율 사진과 작성한 캡션을 확인합니다.
          </Dialog.Description>
          {selected && selectedIndex !== null ? (
            <SharePhotoDetail
              index={selectedIndex}
              photo={selected}
              shareId={share.shareId}
            />
          ) : null}
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="사진 상세 닫기"
              className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition-colors hover:bg-black/80 motion-reduce:transition-none"
            >
              <CloseIcon />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
