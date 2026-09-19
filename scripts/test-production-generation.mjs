// Run after next build. Starts a real next start server; only provider HTTP is stubbed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir, rename } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildFeed } from '../lib/pipeline.js';
import { validateGenerateResponse } from '../lib/interaction.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json', import.meta.url), 'utf8'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const server = spawn(process.execPath, [
  '--import', fileURLToPath(new URL('../test/support/generation-provider.mjs', import.meta.url)),
  'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port),
], { cwd: root, env: { ...process.env, ANTHROPIC_API_KEY: 'production-regression-fake-key', ANTHROPIC_WORKSPACE_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });
const exited = once(server, 'exit');
const base = `http://127.0.0.1:${port}`;
let lastInput;
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    assert.equal(server.exitCode, null, 'next start exited before readiness');
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, 'next start did not become ready');
  for (const count of [3, 15]) {
    for (const prompt of ['', '사진의 분위기를 짧고 담백하게 기록해 줘']) {
      // Offline regression fixtures, not real-image quality evidence.
      const photos = Array.from({ length: count }, (_, i) => ({
        ...structuredClone(fixture.context.photos[i % fixture.context.photos.length]),
        photo_id: `production_${i}`, input_index: i,
      }));
      const built = await buildFeed({ schema_version: '1.0', session_id: 'production-regression', photos,
        identity: { target: prompt ? { kind: 'text', text: prompt } : { kind: 'none' }, current: { kind: 'none' } } });
      for (const mode of ['all', 'slot']) {
        const input = { schema_version: '1.0', mode, ...built,
          ...(mode === 'slot' ? { photo_id: built.feed.slots[0].photo_id } : {}) };
        lastInput = input;
        const response = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000) });
        const value = await response.json();
        assert.equal(response.status, 200, `${count}/${prompt ? 'written' : 'empty'}/${mode}: ${JSON.stringify(value)}`);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        validateGenerateResponse(value, input);
        const slots = mode === 'all' ? value.output.slots : [value.slot];
        assert.equal(slots.length, mode === 'all' ? count : 1);
        console.log(`PASS ${count} photos / ${prompt ? 'written' : 'empty'} prompt / ${mode}: HTTP 200, response contract, exact complete system prompt`);
      }
    }
  }
  console.log('PASS missing-prompt oracle: all four individual omissions rejected');
  // Exercise each missing physical bundle asset, restoring it even on assertion failure.
  // Run this command exclusively: it temporarily renames assets in the local build.
  const assets = new URL('../.next/server/assets/', import.meta.url);
  const names = await readdir(assets);
  for (const stem of ['style_guard', 'title', 'caption', 'omit_reason']) {
    const matches = names.filter(name => name.startsWith(stem + '.') && name.endsWith('.md'));
    assert.equal(matches.length, 1, `Expected one emitted ${stem} asset`);
    const asset = new URL(matches[0], assets);
    const hidden = new URL(matches[0] + '.missing-test', assets);
    await rename(asset, hidden);
    try {
      const response = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lastInput), signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 500, `Missing ${stem} must fail closed`);
      assert.equal((await response.json()).error.code, 'INTERNAL_ERROR');
      console.log(`PASS missing bundled ${stem}: HTTP 500, no partial-prompt success`);
    } finally {
      await rename(hidden, asset);
    }
  }
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  server.kill('SIGTERM');
  const force = setTimeout(() => server.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(force);
}
