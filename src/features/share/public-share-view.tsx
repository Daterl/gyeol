'use client';

import Image from 'next/image';
import { type KeyboardEvent, useRef, useState } from 'react';
import type { PublicShare } from './public-share';
import { publicImageUrl } from './public-share';

export function moveCarousel(index: number, count: number, delta: number) {
  return Math.min(Math.max(index + delta, 0), count - 1);
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

export function PublicShareView({ share }: { share: PublicShare }) {
  const { photos } = share.curation;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const selected = photos[selectedIndex];
  const move = (delta: number) => {
    setSelectedIndex((index) => moveCarousel(index, photos.length, delta));
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    }
  };
  const handleTouchEnd = (clientX: number) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null || Math.abs(clientX - startX) < 40) return;
    move(clientX < startX ? 1 : -1);
  };

  return (
    <>
      <a
        className="absolute -top-20 left-4 z-50 rounded-lg bg-ink px-4 py-3 text-paper focus:top-3"
        href="#shared-carousel"
      >
        사진 캐러셀로 건너뛰기
      </a>
      <main className="mx-auto min-h-dvh w-full max-w-[935px] overflow-x-hidden pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <ProfileHeader share={share} />
        <h1 className="sr-only">공유된 사진 흐름</h1>
        <section
          id="shared-carousel"
          aria-label={`${photos.length}장의 공유 사진 캐러셀`}
          aria-roledescription="carousel"
          className="overflow-hidden border-y border-line bg-black"
          onTouchEnd={(event) => {
            const touch = event.changedTouches[0];
            if (touch) handleTouchEnd(touch.clientX);
          }}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
        >
          <ol
            className="flex aspect-[4/5] max-h-[78dvh] transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
          >
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                aria-hidden={index !== selectedIndex}
                className="relative min-w-full"
              >
                <Image
                  src={publicImageUrl(share.shareId, photo.id)}
                  alt={`${index + 1}번째 공유 사진${index === 0 ? ', 표지' : ''}`}
                  fill
                  unoptimized
                  priority={index === 0}
                  sizes="(min-width: 935px) 935px, 100vw"
                  style={
                    photo.focalPoint
                      ? {
                          objectPosition: `${photo.focalPoint.x * 100}% ${photo.focalPoint.y * 100}%`,
                        }
                      : undefined
                  }
                  className="object-cover"
                />
              </li>
            ))}
          </ol>
        </section>
        <div className="flex items-center justify-between border-b border-line bg-card px-4 py-3">
          <button
            type="button"
            aria-label="이전 사진"
            className="min-h-11 rounded-lg px-3 text-sm font-medium disabled:text-muted-foreground"
            disabled={selectedIndex === 0}
            onClick={() => move(-1)}
            onKeyDown={handleKeyDown}
          >
            이전
          </button>
          <p aria-live="polite" className="font-mono text-xs tracking-[0.14em]">
            {selectedIndex + 1} / {photos.length}
            {selectedIndex === 0 ? ' · 표지' : ''}
          </p>
          <button
            type="button"
            aria-label="다음 사진"
            className="min-h-11 rounded-lg px-3 text-sm font-medium disabled:text-muted-foreground"
            disabled={selectedIndex === photos.length - 1}
            onClick={() => move(1)}
            onKeyDown={handleKeyDown}
          >
            다음
          </button>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
            {String(selectedIndex + 1).padStart(2, '0')}
          </p>
          {selected.caption ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {selected.caption}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              캡션 없이 공유했어요.
            </p>
          )}
        </div>
        <footer className="px-5 pt-8 text-center text-xs text-muted-foreground">
          결로 정리한 사진 흐름
        </footer>
      </main>
    </>
  );
}
