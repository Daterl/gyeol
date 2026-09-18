'use client';

import Image from 'next/image';
import { useId, useRef } from 'react';
import { Button } from '../../components/ui/button';
import type { SelectedPhoto } from '../editor/store';

export function PhotoPicker({
  label,
  photos,
  onAdd,
  onRemove,
  disabled = false,
}: {
  disabled?: boolean;
  label: string;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  photos: SelectedPhoto[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const choose = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const hint = useId();
  function remove(id: string) {
    const index = photos.findIndex((photo) => photo.photo_id === id);
    const next = photos[index + 1] ?? photos[index - 1];
    onRemove(id);
    requestAnimationFrame(() =>
      (next
        ? removeButtons.current.get(next.photo_id)
        : choose.current
      )?.focus(),
    );
  }
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled) onAdd(Array.from(event.dataTransfer.files));
      }}
    >
      <legend className="mb-3 text-base font-semibold">
        {label}{' '}
        <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
          {photos.length}장
        </span>
      </legend>
      {photos.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 min-[390px]:grid-cols-3 sm:grid-cols-5">
          {photos.map((photo, index) => (
            <li key={photo.photo_id} className="min-w-0">
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="block bg-card"
                aria-label={`${index + 1}번 ${photo.file.name} 원본 보기`}
              >
                <Image
                  alt={`${index + 1}번 선택 사진: ${photo.file.name}`}
                  className="aspect-[4/5] w-full object-cover"
                  width={160}
                  height={200}
                  src={photo.url}
                  unoptimized
                />
              </a>
              <div className="flex items-center justify-between gap-1 border-b border-line py-1">
                <span className="font-mono text-sm">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  ref={(element) => {
                    if (element)
                      removeButtons.current.set(photo.photo_id, element);
                    else removeButtons.current.delete(photo.photo_id);
                  }}
                  onClick={() => remove(photo.photo_id)}
                  className="min-h-11 px-2 text-sm underline-offset-4 hover:underline"
                  aria-label={`${photo.file.name} 삭제`}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-dashed border-accent-line bg-card px-5 py-6">
        <div>
          <p className="font-medium">
            {photos.length
              ? '더 담고 싶은 사진이 있나요?'
              : '사진을 여기에 놓아 주세요.'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground" id={hint}>
            JPEG·PNG·WebP, 한 장 3MB · 최대 20장
          </p>
        </div>
        <Button
          ref={choose}
          data-photo-picker={label}
          type="button"
          variant="outline"
          className="min-h-11 px-5"
          onClick={() => input.current?.click()}
          disabled={photos.length === 20}
          aria-describedby={hint}
        >
          {label === '올릴 사진' ? '사진 고르기' : '기존 사진 고르기'}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
    </fieldset>
  );
}
