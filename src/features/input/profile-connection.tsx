'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, createProfileClient } from '@/lib/api';
import type { ProfileConnectionResponse } from '@/types/contracts';

export type ConnectedProfile = {
  url: string;
  snapshotId: string;
  expires_at: number;
};
export const profileMessage: Record<
  ProfileConnectionResponse['status'],
  string
> = {
  public: '공개 프로필 연결 완료',
  pending: '공개 프로필을 확인하고 있어요.',
  private: '비공개 계정이에요. 다른 공개 프로필을 연결해 주세요.',
  not_found:
    '계정을 찾지 못했어요. URL을 확인하거나 다른 공개 프로필을 연결해 주세요.',
  timeout: '확인 시간이 초과됐어요. 잠시 후 다시 확인해 주세요.',
  cost_limit: '수집 한도에 도달했어요. 잠시 후 다시 확인해 주세요.',
  unconfirmed:
    '공개 여부를 확인하지 못했어요. 다른 공개 프로필을 연결하거나 다시 확인해 주세요.',
  provider_error:
    '수집 서비스에서 오류가 났어요. 비공개 계정이라는 뜻은 아니에요.',
  expired: '연결이 만료됐어요. 원할 때 다시 수집할 수 있어요.',
  missing: '저장된 연결이 없어요. 비용 안내를 확인한 뒤 연결해 주세요.',
};
export function ProfileConnection({
  onChange,
  disabled = false,
}: {
  onChange: (value: ConnectedProfile | null) => void;
  disabled?: boolean;
}) {
  const [client] = useState(createProfileClient);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ProfileConnectionResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(
      () => setRetryAt(0),
      Math.max(0, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  useEffect(() => {
    if (result?.status !== 'public' || typeof result.expires_at !== 'number')
      return;
    const timer = setTimeout(
      () => {
        setResult({ status: 'expired', refresh_required: true });
        onChange(null);
      },
      Math.max(0, result.expires_at - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [result, onChange]);
  async function connect(action: 'connect' | 'status') {
    if (Date.now() < retryAt || (action === 'connect' && !confirmed)) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    onChange(null);
    try {
      let next: ProfileConnectionResponse;
      for (let attempt = 0; ; attempt++) {
        next = await client(
          action === 'connect' && attempt === 0
            ? {
                schema_version: '1.0',
                action,
                profile_url: url.trim(),
                confirmLive: true,
                refresh: result?.refresh_required ?? false,
              }
            : {
                schema_version: '1.0',
                action: 'status',
                profile_url: url.trim(),
              },
          controller.signal,
        );
        if (active.current !== controller) return;
        setResult(next);
        if (next.status !== 'pending' || attempt >= 9) break;
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(controller.signal.reason);
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener('abort', abort);
            resolve();
          }, 2000);
          controller.signal.addEventListener('abort', abort, { once: true });
        });
      }
      if (next.status === 'public' && typeof next.expires_at === 'number')
        onChange({
          url: url.trim(),
          snapshotId: next.snapshotId,
          expires_at: next.expires_at,
        });
    } catch (failure) {
      if (active.current !== controller || controller.signal.aborted) return;
      const retry =
        failure instanceof ApiError ? failure.retryAfter : undefined;
      if (retry) setRetryAt(Date.now() + retry * 1000);
      setError(
        `${failure instanceof Error ? failure.message : '연결을 확인하지 못했어요.'}${retry ? ` ${retry}초 뒤 다시 확인해 주세요.` : ''}`,
      );
    } finally {
      if (active.current === controller) {
        setBusy(false);
        active.current = null;
        setConfirmed(false);
      }
    }
  }
  return (
    <section
      className="space-y-3 border-y border-line py-5"
      aria-labelledby="profile-heading"
    >
      <h2 id="profile-heading" className="font-semibold">
        1. 공개 프로필 연결
      </h2>
      <p className="text-sm text-muted-foreground">
        OAuth나 계정 소유권 인증이 아니에요. 공개 게시물의 일부만 참고하며 수집
        시점과 표본에 따라 스타일이 다르게 보일 수 있어요.
      </p>
      <label className="block text-sm">
        공개 Instagram 프로필 URL
        <input
          type="url"
          value={url}
          disabled={disabled}
          placeholder="https://www.instagram.com/username/"
          className="mt-2 min-h-11 w-full rounded-md border border-line px-3"
          onChange={(event) => {
            active.current?.abort();
            active.current = null;
            setBusy(false);
            setUrl(event.target.value);
            setResult(null);
            setError('');
            setConfirmed(false);
            onChange(null);
          }}
        />
      </label>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || disabled}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 size-5 shrink-0"
        />
        캐시가 없거나 만료되면 유료 수집이 시작될 수 있음을 확인했어요. 24시간
        안에는 저장된 결과를 사용해요.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            !url.trim() || !confirmed || busy || disabled || retryAt > 0
          }
          onClick={() => void connect('connect')}
        >
          공개 프로필 연결
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!url.trim() || busy || disabled || retryAt > 0}
          onClick={() => void connect('status')}
        >
          저장된 연결 확인
        </Button>
        {busy && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              active.current?.abort();
              active.current = null;
              setBusy(false);
              setConfirmed(false);
            }}
          >
            확인 취소
          </Button>
        )}
      </div>
      <p role="status" className="text-sm">
        {busy
          ? profileMessage.pending
          : result
            ? profileMessage[result.status]
            : ''}
        {!busy && result?.status === 'pending'
          ? ' 자동 확인을 멈췄어요. 저장된 연결 확인으로 이어갈 수 있어요.'
          : ''}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
