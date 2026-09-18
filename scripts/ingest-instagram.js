// Explicit paid start: node scripts/ingest-instagram.js start <public URL> <output directory>
// Resume without starting a new paid run: node scripts/ingest-instagram.js status <output directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createInstagramIngest, instagramAccount } from '../lib/apify_ingest.js';
const [action, argument, output] = process.argv.slice(2);
const client = createInstagramIngest();
try {
  if (!['start', 'status', 'cancel'].includes(action)) throw new Error('start <URL> <directory> | status <directory> | cancel <directory>');
  if (action === 'start') instagramAccount(argument);
  const directory = resolve(action === 'start' ? output ?? 'storage/instagram' : argument ?? 'storage/instagram');
  await mkdir(directory, { recursive: true });
  const receiptFile = join(directory, 'receipt.json');
  let job;
  if (action === 'start') {
    // Reserve the output before charging; never overwrite the only receipt of an earlier run.
    await writeFile(receiptFile, JSON.stringify({ status: 'START_PENDING' }), { flag: 'wx', mode: 0o600 });
    job = await client.start({ url: argument, limit: 3 });
    await writeFile(receiptFile, JSON.stringify(job, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ status: job.status, run_id: job.run_id, receipt_file: receiptFile }));
  } else {
    job = JSON.parse(await readFile(receiptFile, 'utf8'));
    if (!job.receipt) throw new Error('시작 여부 미확인: 제공자 실행 목록 확인 후 재개하세요. 자동으로 새 실행을 만들지 않습니다.');
    const result = await (action === 'cancel' ? client.cancel(job.receipt) : client.inspect(job.receipt));
    await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ status: result.status, metrics: result.metrics, posts: result.snapshot?.posts.length,
      current_sample_size: result.currentProfile?.sample_size, target_sample_size: result.targetProfile?.sample_size }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ code: error.code ?? 'INGEST_CLI_ERROR', message: error.message, details: error.details ?? {} }));
  process.exitCode = 1;
}
