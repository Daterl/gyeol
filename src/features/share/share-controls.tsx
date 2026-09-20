'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ConfirmedCuration } from '../editor/curation-store';
import type { SelectedPhoto } from '../editor/store';
import {
  createBlobPhotoUploader,
  createManagementKey,
  createShareClient,
  ShareApiError,
  type SharePhoto,
} from './share-client';
import {
  loadShareManagement,
  parseShareManagementTransfer,
  removeShareManagement,
  type ShareManagementRecord,
  saveShareManagement,
} from './share-management';

const client = createShareClient({ uploadPhoto: createBlobPhotoUploader() });

export async function sharePhotosFor(
  confirmed: ConfirmedCuration,
  selected: SelectedPhoto[],
): Promise<SharePhoto[]> {
  const files = new Map(selected.map((photo) => [photo.photo_id, photo.file]));
  return Promise.all(
    confirmed.output.slots.map(async ({ photo_id }) => {
      const file = files.get(photo_id);
      if (!file) throw new ShareApiError('INVALID_INPUT');
      return { id: photo_id, body: new Uint8Array(await file.arrayBuffer()) };
    }),
  );
}

type PublishedShare = ShareManagementRecord & {
  confirmed: ConfirmedCuration | null;
};
type RotatingShare = {
  v: 1;
  shareId: string;
  managementKey: string;
  etag: string;
  nextManagementKey: string;
  confirmed: ConfirmedCuration | null;
};

const errorMessage = (error: unknown) =>
  error instanceof ShareApiError
    ? error.code === 'CONFLICT'
      ? '다른 변경이 먼저 반영됐어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.'
      : error.code === 'STORAGE_REQUIRED'
        ? '관리 정보를 저장할 수 없어 요청을 보내지 않았어요.'
        : '공유 요청의 완료 여부를 확인하지 못했어요. 저장된 관리 정보로 다시 확인해 주세요.'
    : '공유 링크를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

export function ShareControls({
  confirmed,
  photos,
}: {
  confirmed: ConfirmedCuration;
  photos: SelectedPhoto[];
}) {
  const [published, setPublished] = useState<PublishedShare | null>(null);
  const [managementSaved, setManagementSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [managementReference, setManagementReference] = useState('');
  const [managementKey, setManagementKey] = useState('');
  const [managementKeyVisible, setManagementKeyVisible] = useState(false);
  const sharePath = published
    ? `/share/${encodeURIComponent(published.shareId)}`
    : '';
  const nextManagementKey =
    published && 'nextManagementKey' in published
      ? published.nextManagementKey
      : null;
  const rotating = nextManagementKey !== null;

  useEffect(() => {
    const restored = loadShareManagement(window.localStorage);
    setManagementSaved(restored.available);
    if (restored.record) setPublished({ ...restored.record, confirmed: null });
  }, []);

  function persist(next: PublishedShare) {
    const base = {
      v: 1 as const,
      shareId: next.shareId,
      managementKey: next.managementKey,
    };
    const record: ShareManagementRecord =
      next.etag === null
        ? { ...base, etag: null }
        : 'nextManagementKey' in next
          ? {
              ...base,
              etag: next.etag,
              nextManagementKey: next.nextManagementKey,
            }
          : { ...base, etag: next.etag };
    return saveShareManagement(window.localStorage, record);
  }

  function acceptPublished(next: PublishedShare, message: string) {
    setPublished(next);
    const saved = persist(next);
    setManagementSaved(saved);
    setNotice(
      saved
        ? message
        : `${message} 관리 정보는 저장하지 못해 이 탭에서만 관리할 수 있어요.`,
    );
  }

  function rejectUnauthorized(error: unknown, rejected: PublishedShare) {
    if (!(error instanceof ShareApiError) || error.code !== 'UNAUTHORIZED')
      return false;
    const removed = removeShareManagement(window.localStorage, rejected);
    setPublished(null);
    setManagementSaved(removed);
    setManagementReference(`/share/${rejected.shareId}`);
    setManagementKey('');
    setManagementKeyVisible(false);
    setNotice('관리 키가 맞지 않아요. 키를 다시 입력해 주세요.');
    return true;
  }

  async function publish() {
    setBusy(true);
    setNotice('공유 링크를 만들고 있어요.');
    try {
      const result = await client.publish({
        confirmed,
        onStarted: async (started) => {
          const pending: PublishedShare = {
            v: 1,
            ...started,
            etag: null,
            confirmed: null,
          };
          if (!persist(pending)) {
            setManagementSaved(false);
            throw new ShareApiError('STORAGE_REQUIRED');
          }
          setPublished(pending);
          setManagementSaved(true);
          setManagementKeyVisible(true);
        },
        photos: await sharePhotosFor(confirmed, photos),
      });
      acceptPublished(
        {
          v: 1,
          shareId: result.shareId,
          managementKey: result.managementKey,
          etag: result.etag,
          confirmed,
        },
        '공유 링크를 만들었어요.',
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function connectManagement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const transfer = parseShareManagementTransfer(
      managementReference,
      managementKey,
    );
    if (!transfer) {
      setNotice('공유 링크 또는 ID와 관리 키 형식을 확인해 주세요.');
      return;
    }
    setBusy(true);
    setNotice('공유 링크를 확인하고 있어요.');
    try {
      const result = await client.read(transfer.shareId);
      if (!result.etag) throw new ShareApiError('INVALID_RESPONSE');
      acceptPublished(
        {
          v: 1,
          ...transfer,
          etag: result.etag,
          confirmed: null,
        },
        '공유 링크를 찾았고 관리 키를 이 브라우저에 저장했어요. 잘못된 키는 관리 작업 때 거부돼요.',
      );
      setManagementKeyVisible(false);
      setManagementReference('');
      setManagementKey('');
    } catch {
      setNotice('공유 링크를 확인하지 못했어요. 링크 또는 ID를 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function publishSeparate() {
    if (
      !window.confirm(
        '별도 새 링크를 만들면 이 브라우저의 관리 정보는 새 링크로 교체되고 기존 공개 링크는 계속 열려요. 새 링크를 만들까요?',
      )
    )
      return;
    await publish();
  }

  async function recoverPublish() {
    if (!published || published.etag !== null) return;
    setBusy(true);
    setNotice('게시 결과를 확인하고 있어요.');
    try {
      const result = await client.read(published.shareId);
      if (!result.etag) throw new ShareApiError('INVALID_RESPONSE');
      acceptPublished(
        {
          v: 1,
          shareId: published.shareId,
          managementKey: published.managementKey,
          etag: result.etag,
          confirmed: null,
        },
        '게시가 완료된 링크를 복구했어요. 현재 확정본 반영 여부를 확인해 주세요.',
      );
    } catch {
      setNotice(
        '아직 게시 완료를 확인하지 못했어요. 잠시 후 다시 확인하거나 관리 연결을 해제해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reconfirm() {
    if (!published || published.etag === null || rotating) return;
    setBusy(true);
    setNotice('새 확정본을 공유 링크에 반영하고 있어요.');
    try {
      const result = await client.reconfirm({
        confirmed,
        etag: published.etag,
        managementKey: published.managementKey,
        photos: await sharePhotosFor(confirmed, photos),
        shareId: published.shareId,
      });
      acceptPublished(
        { ...published, etag: result.etag, confirmed },
        '새 확정본을 공유 링크에 반영했어요.',
      );
    } catch (error) {
      if (rejectUnauthorized(error, published)) return;
      if (error instanceof ShareApiError && error.code === 'CONFLICT') {
        try {
          const latest = await client.read(published.shareId);
          if (latest.etag) {
            acceptPublished(
              { ...published, etag: latest.etag },
              '최신 공유 상태를 불러왔어요. 다시 반영해 주세요.',
            );
            return;
          }
        } catch {}
      }
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function rotateKey() {
    if (!published || published.etag === null) return;
    const nextManagementKey =
      'nextManagementKey' in published &&
      typeof published.nextManagementKey === 'string'
        ? published.nextManagementKey
        : createManagementKey();
    const pending: RotatingShare = {
      v: 1,
      shareId: published.shareId,
      managementKey: published.managementKey,
      etag: published.etag,
      nextManagementKey,
      confirmed: published.confirmed,
    };
    if (!persist(pending)) {
      setManagementSaved(false);
      setNotice('새 관리 키를 저장할 수 없어 교체 요청을 보내지 않았어요.');
      return;
    }
    setPublished(pending);
    setManagementSaved(true);
    setBusy(true);
    try {
      const result = await client.rotateKey({
        etag: pending.etag,
        managementKey: pending.managementKey,
        nextManagementKey: pending.nextManagementKey,
        shareId: pending.shareId,
      });
      acceptPublished(
        {
          v: 1,
          shareId: pending.shareId,
          managementKey: pending.nextManagementKey,
          etag: result.etag,
          confirmed: pending.confirmed,
        },
        '링크 관리 키를 새로 바꿨어요.',
      );
      setManagementKeyVisible(true);
    } catch (error) {
      if (rejectUnauthorized(error, pending)) return;
      if (error instanceof ShareApiError && error.code === 'CONFLICT') {
        try {
          const latest = await client.read(pending.shareId);
          if (latest.etag) {
            acceptPublished(
              { ...pending, etag: latest.etag },
              '최신 공유 상태를 불러왔어요. 같은 새 관리 키로 다시 시도해 주세요.',
            );
            return;
          }
        } catch {}
      }
      setNotice(
        '관리 키 교체 완료 여부를 확인하지 못했어요. 저장된 새 키로 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (
      !published ||
      published.etag === null ||
      rotating ||
      !window.confirm('이 공유 링크를 비활성화할까요? 되돌릴 수 없어요.')
    )
      return;
    setBusy(true);
    try {
      await client.revoke(published);
      const removed = removeShareManagement(window.localStorage, published);
      setPublished(null);
      setManagementSaved(removed);
      setNotice(
        removed
          ? '공유 링크를 비활성화했어요.'
          : '공유 링크를 비활성화했지만 브라우저의 관리 정보를 지우지 못했어요.',
      );
    } catch (error) {
      if (rejectUnauthorized(error, published)) return;
      if (error instanceof ShareApiError && error.code === 'CONFLICT') {
        try {
          const latest = await client.read(published.shareId);
          if (latest.etag) {
            acceptPublished(
              { ...published, etag: latest.etag },
              '최신 공유 상태를 불러왔어요. 공유 중지를 다시 눌러 주세요.',
            );
            return;
          }
        } catch {}
      }
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function detach() {
    if (!published) return;
    const pendingPublish = published.etag === null;
    if (
      !window.confirm(
        pendingPublish
          ? '게시 결과 확인을 중단하고 이 브라우저의 관리 정보를 지울까요? 게시가 완료됐더라도 다시 관리할 수 없어요.'
          : '공개 링크는 유지하고 이 브라우저의 관리 연결만 해제할까요? 관리 키를 따로 보관하지 않았다면 다시 관리할 수 없어요.',
      )
    )
      return;
    if (!removeShareManagement(window.localStorage, published)) {
      setManagementSaved(false);
      setNotice('브라우저의 링크 관리 정보를 지우지 못했어요.');
      return;
    }
    setPublished(null);
    setManagementSaved(true);
    setManagementKeyVisible(false);
    setNotice(
      pendingPublish
        ? '게시 결과 확인을 중단하고 이 브라우저의 관리 정보를 지웠어요.'
        : '이 브라우저의 관리 연결을 해제했어요. 공개 링크는 그대로 유지돼요.',
    );
  }

  async function shareLink() {
    if (!published) return;
    const url = new URL(sharePath, window.location.href).href;
    const nativeShare = Reflect.get(navigator, 'share') as
      | ((data: ShareData) => Promise<void>)
      | undefined;
    try {
      if (nativeShare)
        await nativeShare.call(navigator, { title: 'GYEOL 큐레이션', url });
      else await navigator.clipboard.writeText(url);
      setNotice(nativeShare ? '공유 창을 열었어요.' : '링크를 복사했어요.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice('링크를 공유하지 못했어요. 아래 링크를 직접 열어 주세요.');
    }
  }

  async function copyManagementKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setNotice('관리 키를 복사했어요.');
    } catch {
      setNotice('관리 키를 복사하지 못했어요. 직접 선택해 복사해 주세요.');
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      {!published ? (
        <>
          <Button type="button" disabled={busy} onClick={publish}>
            {busy ? '처리 중…' : '공유 링크 만들기'}
          </Button>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              기존 공유 링크 관리하기
            </summary>
            <form className="mt-3 space-y-3" onSubmit={connectManagement}>
              <label className="block space-y-1">
                <span>공유 링크 또는 ID</span>
                <input
                  className="min-h-11 w-full rounded-lg border border-line bg-card px-3"
                  value={managementReference}
                  onChange={(event) =>
                    setManagementReference(event.target.value)
                  }
                  autoCapitalize="none"
                  placeholder="https://…/share/…"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span>관리 키</span>
                <input
                  className="min-h-11 w-full rounded-lg border border-line bg-card px-3 font-mono"
                  type="password"
                  value={managementKey}
                  onChange={(event) => setManagementKey(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </label>
              <p className="text-xs text-muted-foreground">
                잃어버린 관리 키는 복구할 수 없어요. 공개 링크와 분리해 안전하게
                보관해 주세요. 키가 맞는지는 실제 관리 작업 때 확인돼요.
              </p>
              <Button type="submit" variant="outline" disabled={busy}>
                관리 연결
              </Button>
            </form>
          </details>
        </>
      ) : (
        <>
          {published.etag === null ? (
            <p className="text-sm font-medium">
              게시 요청 결과를 아직 확인하지 못했어요. 현재 확정본이 공개 링크에
              반영됐다고 간주하지 않아요.
            </p>
          ) : (
            <>
              {published.confirmed === null && (
                <p className="text-sm font-medium">
                  이전에 이 브라우저에서 관리하던 링크예요. 현재 확정본은 아직
                  이 링크에 반영되지 않았어요.
                </p>
              )}
              {rotating && (
                <p className="text-sm font-medium">
                  관리 키 교체 결과를 확인해야 해요. 저장된 같은 새 키로 다시
                  시도할 수 있어요.
                </p>
              )}
              <a
                href={sharePath}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center break-all text-sm text-[#00376b] underline"
              >
                공유 페이지 열기
              </a>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {published.etag === null ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={recoverPublish}
              >
                게시 결과 다시 확인
              </Button>
            ) : (
              <>
                <Button type="button" disabled={busy} onClick={shareLink}>
                  링크 공유
                </Button>
                {!rotating && published.confirmed !== confirmed && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={reconfirm}
                  >
                    현재 확정본으로 기존 링크 교체
                  </Button>
                )}
                {!rotating && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={publishSeparate}
                  >
                    별도 새 링크 만들기
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={rotateKey}
                >
                  {rotating ? '같은 새 관리 키로 다시 시도' : '관리 키 교체'}
                </Button>
                {!rotating && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={revoke}
                  >
                    공유 중지
                  </Button>
                )}
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={detach}
            >
              이 브라우저에서 관리 연결 해제
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {managementSaved
              ? '관리 정보는 이 브라우저에 저장돼요. 브라우저 데이터를 지우면 이 링크를 다시 관리할 수 없어요.'
              : '관리 정보를 저장하지 못해 이 탭에서만 링크를 관리할 수 있어요.'}
          </p>
          <div className="space-y-2 rounded-lg border border-line p-3">
            <p className="text-xs font-medium">관리 키</p>
            <input
              aria-label="현재 관리 키"
              className="min-h-11 w-full rounded-md border border-line bg-card px-3 font-mono text-xs"
              type={managementKeyVisible ? 'text' : 'password'}
              value={published.managementKey}
              readOnly
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setManagementKeyVisible((visible) => !visible)}
            >
              {managementKeyVisible ? '관리 키 숨기기' : '관리 키 보기'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => copyManagementKey(published.managementKey)}
            >
              관리 키 복사
            </Button>
            {nextManagementKey && (
              <>
                <p className="text-xs font-medium">교체 확인 중인 새 관리 키</p>
                <input
                  aria-label="교체 확인 중인 새 관리 키"
                  className="min-h-11 w-full rounded-md border border-line bg-card px-3 font-mono text-xs"
                  type={managementKeyVisible ? 'text' : 'password'}
                  value={nextManagementKey}
                  readOnly
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => copyManagementKey(nextManagementKey)}
                >
                  새 관리 키 복사
                </Button>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              잃어버린 관리 키는 복구할 수 없어요. 공개 링크와 분리해 안전하게
              보관해 주세요.
            </p>
          </div>
        </>
      )}
      <p role="status" aria-live="polite" className="text-sm">
        {notice}
      </p>
    </div>
  );
}
