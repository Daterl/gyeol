import {
  authenticateModelRequest,
  modelAccessErrorResponse,
  takeModelBudget,
} from '../../../../lib/model-access.js';
import { handleAnalyze } from '../../../../lib/pipeline.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type ModelAccessOptions = {
  accessKey?: string;
  browser?: { secret?: string; origin?: string; now?: () => number };
  limiter?: { take(action: string, sessionId?: string): Promise<void> };
  env?: NodeJS.ProcessEnv;
};
const runAnalyze = handleAnalyze as (
  request: Request,
  options?: { beforeProvider?: () => Promise<void> },
) => Promise<Response>;

export async function protectedAnalyze(
  request: Request,
  options: ModelAccessOptions = {},
) {
  if (request.method !== 'POST') return runAnalyze(request);
  if (new URL(request.url).searchParams.get('mock') === '1')
    return runAnalyze(request);
  let sessionId: string;
  try {
    sessionId = authenticateModelRequest(request, options);
  } catch (error) {
    return modelAccessErrorResponse(error);
  }
  return runAnalyze(request, {
    beforeProvider: () => takeModelBudget(sessionId, options),
  });
}

const analyze = (request: Request) => protectedAnalyze(request);

export {
  analyze as DELETE,
  analyze as GET,
  analyze as HEAD,
  analyze as OPTIONS,
  analyze as PATCH,
  analyze as POST,
  analyze as PUT,
};
