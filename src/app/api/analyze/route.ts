import { handleAnalyze } from '../../../../lib/pipeline.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function analyze(request: Request) {
  return handleAnalyze(request);
}

export {
  analyze as DELETE,
  analyze as GET,
  analyze as HEAD,
  analyze as OPTIONS,
  analyze as PATCH,
  analyze as POST,
  analyze as PUT,
};
