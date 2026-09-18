// Server-only public Instagram ingestion. No model calls and no automatic paid retries.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { buildCurrentProfile } from './current_profile.js';
import { extractFromReference } from './target_profile.js';
import { validateProfile } from './contracts.js';

export const ACTOR = 'apify/instagram-scraper';
export const LIMITS = Object.freeze({ posts: 30, timeoutSecs: 120, maxTotalChargeUsd: 0.10 });
const API = 'https://api.apify.com/v2';
const reserved = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct']);
const messages = {
  INVALID_URL: '공개 계정 URL을 확인해 주세요.',
  INVALID_INPUT: '수집 입력을 확인해 주세요.',
  PRIVATE_ACCOUNT: '비공개 계정은 읽을 수 없어요. 올렸던 사진을 직접 올려주시면 그대로 분석해 드려요.',
  ACCOUNT_NOT_FOUND: '계정을 찾을 수 없어요. 주소를 확인하거나, 올렸던 사진을 직접 올려주세요.',
  ACCESS_UNAVAILABLE: '계정에 접근할 수 없어요. 올렸던 사진을 직접 올려주시면 그대로 분석해 드려요.',
  ACCOUNT_UNCONFIRMED: '계정 상태나 게시물을 확인하지 못했어요. 올렸던 사진을 직접 올려주시면 그대로 분석해 드려요.',
  PROVIDER_ERROR: '수집 제공자에서 오류가 발생했어요.',
  PROVIDER_TIMEOUT: '수집 제한 시간을 넘었어요.',
  COST_LIMIT: '수집 비용 또는 요청량 한도에 도달했어요.',
  NOT_CONFIGURED: '라이브 수집이 설정되지 않았어요.',
  UNAUTHORIZED: '라이브 수집 권한이 없어요.',
  INVALID_RECEIPT: '수집 실행 확인 정보가 유효하지 않아요.',
  INVALID_DATA: '수집 결과의 필수 정보나 계정 출처를 확인하지 못했어요.',
  START_UNCONFIRMED: '실행 시작 여부를 확인하지 못했어요. 다시 시작하기 전에 제공자 실행 목록을 확인해 주세요.',
};
export class IngestError extends Error {
  constructor(code, details = {}) { super(messages[code]); this.name = 'IngestError'; this.code = code; this.details = details; }
}
const fail = (code, details) => { throw new IngestError(code, details); };
export function instagramAccount(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_URL'); }
  const match = url.pathname.match(/^\/([A-Za-z0-9_.]{1,30})\/?$/);
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password || !match || reserved.has(match[1].toLowerCase())) fail('INVALID_URL');
  const account = match[1].toLowerCase();
  return { account, url: `https://www.instagram.com/${account}/` };
}
const text = v => typeof v === 'string' && v.length > 0;
// Instagram's logged-out profile page still carries the account's own privacy flag, so public/private
// is decidable before paying for a run. Returns null when the page does not state it for this account.
// ponytail: HTML marker scrape, the only free signal; if the marker moves this returns null and start() blocks.
const PROFILE_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
export function privacyFromHtml(html, account) {
  if (!text(html) || !text(account)) return null;
  if (!html.includes(`"username":"${account}"`)) return null;
  const found = html.match(/"is_private":(true|false)/g);
  if (found?.length !== 1) return null;
  return found[0].endsWith('true') ? 'private' : 'public';
}
const media = (item, index) => ({ id: item.id ?? null, index, type: item.type ?? null, display_url: item.displayUrl ?? null, video_url: item.videoUrl ?? null });
// Classified against what apify/instagram-scraper actually returns: a missing account yields
// { error: 'not_found', errorDescription: 'Post does not exist' }. Anything else stays unclassified
// rather than guessing, and the provider's own wording is carried into details either way.
const responseError = row => {
  const error = row?.error ?? row?.['#error'];
  if (!text(error)) return;
  const details = { provider_error: error, ...(text(row.errorDescription) ? { provider_message: row.errorDescription } : {}) };
  fail(error === 'not_found' ? 'ACCOUNT_NOT_FOUND' : 'ACCOUNT_UNCONFIRMED', details);
};
export function normalizeInstagram(items, { url, runId, datasetId, collectedAt = new Date().toISOString(), accountScope = 'n/a' }) {
  const { account, url: sourceUrl } = instagramAccount(url);
  if (!['main', 'sub', 'n/a'].includes(accountScope) || !text(runId) || !text(datasetId)) fail('INVALID_INPUT');
  if (!Array.isArray(items) || items.length === 0) fail('ACCOUNT_UNCONFIRMED');
  const seenIds = new Set(), seenShortcodes = new Set();
  const excluded = [];
  const posts = [];
  for (const row of items) {
    responseError(row);
    if (!row || typeof row !== 'object') fail('INVALID_DATA');
    let inputAccount;
    if (row.inputUrl) { try { inputAccount = instagramAccount(row.inputUrl).account; } catch { fail('INVALID_DATA'); } }
    if (inputAccount && inputAccount !== account) fail('INVALID_DATA');
    // Only the author owns a post. The provider also returns posts written by other people that this
    // account is merely credited on as a co-author - including for a private account, whose own posts
    // it never returns. Those are a stranger's writing, so they leave the snapshot instead of becoming
    // this account's observations, and the exclusion is recorded rather than dropped silently.
    const owner = text(row.ownerUsername) ? row.ownerUsername.toLowerCase() : null;
    if (!owner) fail('INVALID_DATA');
    if (owner !== account) { excluded.push(owner); continue; }
    if (!text(row.id) || !text(row.shortCode) || typeof row.caption !== 'string' || !text(row.url)) fail('INVALID_DATA');
    if (seenIds.has(row.id) || seenShortcodes.has(row.shortCode)) fail('INVALID_DATA');
    seenIds.add(row.id); seenShortcodes.add(row.shortCode);
    if (!['Image', 'Video', 'Sidecar'].includes(row.type)) fail('INVALID_DATA');
    if (row.type === 'Sidecar' && (!Array.isArray(row.childPosts) || row.childPosts.length < 2 || row.childPosts.some(x => !x || typeof x !== 'object' || !text(x.id) || !['Image', 'Video'].includes(x.type)))) fail('INVALID_DATA');
    const children = row.type === 'Sidecar' ? row.childPosts.map(media) : [];
    posts.push({
      ...media(row, posts.length), shortCode: row.shortCode, shortcode: row.shortCode,
      caption: row.caption, child_count: children.length || 1, children,
      url: row.url, published_at: row.timestamp ?? null, event_at: null,
      owner_id: row.ownerId ?? null, owner_username: row.ownerUsername ?? null,
      coauthors: row.coauthorProducers ?? null, photo_tags: row.taggedUsers ?? null,
      mentions: row.mentions ?? null, hashtags: row.hashtags ?? null,
      location: row.locationName ?? null, music: row.musicInfo ?? null,
    });
  }
  // Nothing this account wrote is not a success, however many co-authored posts came back.
  if (posts.length === 0) fail('ACCOUNT_UNCONFIRMED', { excluded_post_count: excluded.length, excluded_owners: [...new Set(excluded)].sort() });
  const snapshotId = `apify:${runId}:${datasetId}`;
  return { snapshot_id: snapshotId, handle: account, posts,
    provenance: { account, account_scope: accountScope, collected_at: collectedAt,
      method: 'apify', actor: ACTOR, run_id: runId, dataset_id: datasetId, source_url: sourceUrl,
      carousel_order_check: { verdict: '확인 불가', note: '제공자 배열 순서를 보존했으며 이 실행의 브라우저 대조는 하지 않았다' },
      coauthored_excluded: { count: excluded.length, owners: [...new Set(excluded)].sort(), note: '입력 계정이 작성자가 아닌 게시물은 이 계정의 관찰에서 제외했다' },
      evidence_refs: { [snapshotId]: sourceUrl, ...Object.fromEntries(posts.flatMap(p => [[p.shortCode, p.url], [`${account}:${p.shortcode}`, p.url]])) },
    },
  };
}

export function createInstagramIngest({ token = process.env.APIFY_TOKEN, secret = process.env.APIFY_INGEST_RECEIPT_SECRET, fetchImpl = fetch, requestTimeoutMs = 5000, profileTimeoutMs = 10000, checkPublic, now = Date.now } = {}) {
  // Unauthenticated page read: the provider token must never travel to instagram.com.
  const readVisibility = checkPublic ?? (async ({ account, url }) => {
    try {
      const response = await fetchImpl(url, { headers: { 'User-Agent': PROFILE_AGENT, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(profileTimeoutMs) });
      return response.ok ? privacyFromHtml(await response.text(), account) : null;
    } catch { return null; }
  });
  const configured = () => { if (!token || !secret || secret.length < 32) fail('NOT_CONFIGURED'); };
  const sign = data => createHmac('sha256', secret).update(data).digest('base64url');
  const receiptFor = data => { const body = Buffer.from(JSON.stringify(data)).toString('base64url'); return `${body}.${sign(body)}`; };
  const readReceipt = receipt => {
    configured();
    if (typeof receipt !== 'string' || receipt.length > 4096) fail('INVALID_RECEIPT');
    const [body, signature, extra] = receipt.split('.');
    const expected = sign(body ?? '');
    if (extra || !signature || Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail('INVALID_RECEIPT');
    try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { fail('INVALID_RECEIPT'); }
  };
  async function api(path, { method = 'GET', body } = {}) {
    configured();
    for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt++) {
      let response;
      try {
        response = await fetchImpl(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(requestTimeoutMs) });
      } catch {
        if (method === 'GET' && attempt === 0) continue;
        fail(method === 'POST' && path.startsWith('/acts/') ? 'START_UNCONFIRMED' : 'PROVIDER_TIMEOUT');
      }
      if (method === 'GET' && attempt === 0 && response.status >= 500) continue;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) fail('UNAUTHORIZED');
        if (response.status === 402 || response.status === 429) fail('COST_LIMIT');
        fail(method === 'POST' && path.startsWith('/acts/') && response.status >= 500 ? 'START_UNCONFIRMED' : 'PROVIDER_ERROR');
      }
      try { return await response.json(); } catch { fail(method === 'POST' && path.startsWith('/acts/') ? 'START_UNCONFIRMED' : 'PROVIDER_ERROR'); }
    }
  }
  async function start({ url, limit = 3, accountScope = 'n/a', knownPrivate = false } = {}) {
    if (typeof knownPrivate !== 'boolean') fail('INVALID_INPUT');
    if (knownPrivate) fail('PRIVATE_ACCOUNT');
    const input = instagramAccount(url);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.posts || !['main', 'sub', 'n/a'].includes(accountScope)) fail('INVALID_INPUT');
    // Decide visibility before spending. The provider does not error on a private account, it returns
    // other people's public posts the account is tagged on, so the paid run must never start here.
    const visibility = await readVisibility(input);
    if (visibility !== 'public') fail(visibility === 'private' ? 'PRIVATE_ACCOUNT' : 'ACCOUNT_UNCONFIRMED', { stage: 'precheck', account: input.account });
    const { data } = await api(`/acts/apify~instagram-scraper/runs?timeout=${LIMITS.timeoutSecs}&maxItems=${limit}&maxTotalChargeUsd=${LIMITS.maxTotalChargeUsd}`, {
      method: 'POST', body: { directUrls: [input.url], resultsType: 'posts', resultsLimit: limit, addParentData: true },
    });
    if (!text(data?.id)) fail('START_UNCONFIRMED');
    const receipt = receiptFor({ runId: data.id, url: input.url, limit, accountScope });
    return { status: 'RUNNING', receipt, run_id: data.id, notice: '선택한 공개 계정을 수집해요. 사전 샘플보다 오래 걸리고 비용이 발생해요.' };
  }
  async function inspect(receipt, cancel = false) {
    const job = readReceipt(receipt);
    try {
      const path = `/actor-runs/${encodeURIComponent(job.runId)}`;
      let { data: run } = await api(path);
      if (cancel && ['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run?.status)) {
        let abortError;
        try { await api(`${path}/abort`, { method: 'POST' }); } catch (error) { abortError = error; }
        // A completion can race with abort. Read the same run again before reporting failure.
        ({ data: run } = await api(path));
        if (abortError && !['SUCCEEDED', 'ABORTED'].includes(run?.status)) throw abortError;
      }
      if (!run || run.id !== job.runId) fail('PROVIDER_ERROR');
      const observedAt = now();
      const provisional = !Number.isFinite(Date.parse(run.finishedAt)) || observedAt - Date.parse(run.finishedAt) < 10000;
      const metrics = { observed_at: new Date(observedAt).toISOString(), provisional, run_id: run.id, build_id: run.buildId ?? null, started_at: run.startedAt ?? null, finished_at: run.finishedAt ?? null,
        duration_seconds: run.stats?.runTimeSecs ?? null, usage_total_usd: run.usageTotalUsd ?? null };
      const context = { receipt, metrics };
      if (run.status === 'TIMED-OUT') fail('PROVIDER_TIMEOUT', context);
      if (run.status === 'ABORTED') return { status: 'CANCELLED', ...context };
      if (run.status === 'FAILED') fail(/(budget|charge|cost|usage limit)/i.test(run.statusMessage ?? '') ? 'COST_LIMIT' : 'PROVIDER_ERROR', context);
      if (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) return { status: 'RUNNING', ...context };
      if (run.status !== 'SUCCEEDED' || !text(run.defaultDatasetId)) fail('PROVIDER_ERROR', context);
      const items = await api(`/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?format=json&limit=${job.limit}`);
      let snapshot;
      try { snapshot = normalizeInstagram(items, { url: job.url, runId: run.id, datasetId: run.defaultDatasetId, collectedAt: run.finishedAt ?? null, accountScope: job.accountScope }); }
      catch (error) { if (error instanceof IngestError) error.details = { ...error.details, ...context }; throw error; }
      const currentProfile = validateProfile(buildCurrentProfile({ snapshot }), 'current');
      const targetProfile = await extractFromReference(job.url, { registry: { [snapshot.handle]: snapshot } });
      return { status: 'SUCCEEDED', ...context, snapshot, currentProfile, targetProfile };
    } catch (error) {
      if (error instanceof IngestError) error.details = { receipt, ...error.details };
      throw error;
    }
  }
  return { start, inspect, cancel: receipt => inspect(receipt, true) };
}
