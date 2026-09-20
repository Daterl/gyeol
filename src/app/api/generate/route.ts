import {
  authenticateModelRequest,
  modelAccessErrorResponse,
  takeModelBudget,
} from '../../../../lib/model-access.js';
import { handleGenerate } from '../../../../lib/output-generation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ModelAccessOptions = {
  accessKey?: string;
  browser?: { secret?: string; origin?: string; now?: () => number };
  limiter?: { take(action: string, sessionId?: string): Promise<void> };
  env?: NodeJS.ProcessEnv;
};

export async function protectedGenerate(
  request: Request,
  options: ModelAccessOptions = {},
) {
  if (request.method !== 'POST') return handleGenerate(request);
  let sessionId: string;
  try {
    sessionId = authenticateModelRequest(request, options);
  } catch (error) {
    return modelAccessErrorResponse(error);
  }
  return handleGenerate(request, {
    beforeProvider: () => takeModelBudget(sessionId, options),
  });
}

const generate = (request: Request) => protectedGenerate(request);

export {
  generate as DELETE,
  generate as GET,
  generate as HEAD,
  generate as OPTIONS,
  generate as PATCH,
  generate as POST,
  generate as PUT,
};
