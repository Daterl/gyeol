// Run with PLAYWRIGHT_MODULE pointing at an existing installation; no dependency added.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildFeed } from '../../../lib/pipeline.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/interaction.sample.json', import.meta.url)));
const outputDir = process.env.UI_EVIDENCE_DIR;
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const calls = [];
let profileStatus = 'private';
try {
  for (const width of [360, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await page.clock.install();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON();
      calls.push({ path, action: body.action });
      const json = async (value, status = 200) => route.fulfill({ status, json: value });
      if (path === '/api/profile/session') return json({ csrfToken: 'offline-csrf', expires_at: Date.now() + 86400000 });
      if (path === '/api/profile') {
        assert.equal(route.request().headers()['x-gyeol-csrf'], 'offline-csrf');
        assert.equal(route.request().headers().authorization, undefined);
        if (body.action === 'connect') assert.equal(body.confirmLive, true);
        return json(profileStatus === 'public' ? { status: 'public', snapshotId: 'offline-reference', expires_at: Date.now() + 600000, refresh_required: false } : { status: profileStatus, refresh_required: false });
      }
      if (path === '/api/analyze') return json({ ...fixture.context.photos[body.input_index % fixture.context.photos.length], photo_id: body.photo_id, input_index: body.input_index, file_ref: body.file_ref, analysis_source: 'heuristic', model: 'offline-browser-fixture' });
      if (path === '/api/feed') {
        assert.equal(body.profile_snapshot_id, 'offline-reference');
        assert.equal('identity' in body, false);
        const response = await buildFeed({ schema_version: '1.0', session_id: body.session_id, photos: body.photos, identity: { current: { kind: 'none' }, target: { kind: 'none' } } });
        return json({ ...response, curation: { schema_version: '1.0', profile_snapshot_id: body.profile_snapshot_id, profile: { snapshot_id: 'offline-snapshot', source_url: body.profile_url, collected_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(), ownership_verified: false, evidence_refs: {} }, prompt: { text: body.prompt || null, evidence: [] }, slots: response.feed.slots.map((slot) => ({ photo_id: slot.photo_id, position: slot.position, included: true, exclusion_candidate: { recommended: true, reason: '오프라인 제외 후보 근거', evidence: [] } })) } });
      }
      if (path === '/api/generate') return json({ output: { title: '오프라인 브라우저 검증', slots: body.feed.slots.map((slot) => ({ photo_id: slot.photo_id, position: slot.position, caption_state: 'omitted', text: null, omit_reason: '오프라인 예시 비움', evidence: [{ kind: 'uploaded_photo', ref: slot.photo_id, note: '사진 관측 예시' }] })) } });
      throw new Error(`Unexpected API ${path}`);
    });
    await page.goto('http://localhost:3218', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('input[type=file]').first().isDisabled(), true);
    await page.getByLabel('공개 Instagram 프로필 URL').fill('https://www.instagram.com/offline_public/');
    const connect = page.getByRole('button', { name: '공개 프로필 연결', exact: true });
    assert.equal(await connect.isDisabled(), true);
    profileStatus = 'private';
    await page.getByRole('button', { name: '저장된 연결 확인' }).click();
    await page.getByText('비공개 계정이에요.', { exact: false }).waitFor();
    assert.equal(await page.locator('input[type=file]').first().isDisabled(), true);
    profileStatus = 'public';
    await page.getByLabel(/캐시가 없거나 만료되면/).check();
    await connect.click();
    await page.getByText('공개 프로필 연결 완료', { exact: true }).waitFor();
    assert.equal(await page.locator('input[type=file]').first().isDisabled(), false);
    const photo = resolve('public/images/gyeol-character/default.webp');
    await page.locator('input[type=file]').first().setInputFiles([1, 2, 3].map((i) => ({ name: `photo-${i}.webp`, mimeType: 'image/webp', buffer: readFileSync(photo) })));
    await page.getByText('3장 선택', { exact: true }).waitFor();
    const create = page.getByRole('button', { name: '큐레이션 만들기', exact: true });
    assert.equal(await create.isDisabled(), true);
    await page.getByLabel(/사진 분석·문장 생성에 유료/).check();
    await create.click();
    await page.getByRole('heading', { name: '3. 프리뷰를 다듬어 주세요' }).waitFor();
    await page.getByLabel('기록의 제목').waitFor();
    const grid = page.getByRole('list', { name: '정사각형 피드 미리보기' });
    assert.equal(await grid.getByRole('button').count(), 3);
    const first = grid.getByRole('button').first();
    const alt = await first.locator('img').getAttribute('alt');
    await first.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await grid.getByRole('button').nth(1).locator('img').getAttribute('alt'), alt);
    await grid.getByRole('button').first().click();
    await page.getByRole('button', { name: '사진 제외', exact: true }).click();
    assert.match(await page.getByTestId('omission-count').textContent(), /2장 포함 · 1장 제외/);
    await page.getByRole('button', { name: '사진 복원', exact: true }).click();
    const caption = page.getByRole('textbox', { name: /번 사진에 내가 쓸 문장/ });
    await caption.fill('직접 편집한 문장');
    assert.match(await page.getByTestId('omission-count').textContent(), /캡션 2개 비움/);
    await page.getByRole('button', { name: '말 없이 두기', exact: true }).click();
    assert.match(await page.getByTestId('omission-count').textContent(), /캡션 3개 비움/);
    await page.getByRole('slider', { name: /가로 중심/ }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('slider', { name: /가로 중심/ }).inputValue(), '51');
    assert.equal(await page.getByLabel(/공유에 공개 프로필 정보 포함/).isChecked(), false);
    await page.getByLabel(/공유에 공개 프로필 정보 포함/).check();
    await page.getByRole('link', { name: '@offline_public' }).waitFor();
    await page.getByLabel(/공유에 공개 프로필 정보 포함/).uncheck();
    assert.equal(await page.getByRole('link', { name: '@offline_public' }).count(), 0);
    await page.getByRole('button', { name: '큐레이션 확정', exact: true }).click();
    await page.getByText('확정본: 3장 · 프로필 미포함.', { exact: false }).waitFor();
    await page.getByRole('button', { name: '사진 제외', exact: true }).click();
    assert.match(await page.getByText('확정본:', { exact: false }).textContent(), /3장/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const undersized = await page.locator('main button:visible').evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.textContent));
    assert.deepEqual(undersized, []);
    await page.getByRole('heading', { name: '3. 프리뷰를 다듬어 주세요' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outputDir}/curation-${width}.png`, fullPage: true });
    if (width === 390) {
      await page.clock.fastForward(600001);
      await page.getByText('연결이 만료됐어요.', { exact: false }).waitFor();
      assert.equal(await grid.getByRole('button').count(), 3);
      assert.match(await page.getByText('확정본:', { exact: false }).textContent(), /3장/);
      assert.equal(await page.getByRole('button', { name: '문장 다시 제안받기', exact: true }).isDisabled(), true);
      profileStatus = 'provider_error';
      await page.getByRole('button', { name: '저장된 연결 확인' }).click();
      await page.getByText('수집 서비스에서 오류가 났어요.', { exact: false }).waitFor();
      assert.equal(await grid.getByRole('button').count(), 3);
      assert.match(await page.getByText('확정본:', { exact: false }).textContent(), /3장/);
      await page.screenshot({ path: `${outputDir}/preserved-after-expiry-390.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, checks: 'profile gate/private recovery/paid confirmation/feed-generate/keyboard/exclude-restore/empty/crop/profile-off/immutable confirmation/44px buttons/no overflow/expiry-reconnect preservation at390', apiCalls: calls.length, pageErrors: errors.length }));
    await page.close();
  }
} finally { await browser.close(); }
console.log('All browser API calls intercepted locally; no provider or deployment contacted.');
