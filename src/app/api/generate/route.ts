import { handleGenerate } from '../../../../lib/output-generation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function generate(request: Request) {
  return handleGenerate(request);
}

export {
  generate as DELETE,
  generate as GET,
  generate as HEAD,
  generate as OPTIONS,
  generate as PATCH,
  generate as POST,
  generate as PUT,
};
