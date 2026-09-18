import { handleProfileSession } from '../../../../../lib/profile-session.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function session(request: Request) {
  return handleProfileSession(request);
}

export {
  session as DELETE,
  session as GET,
  session as HEAD,
  session as OPTIONS,
  session as PATCH,
  session as POST,
  session as PUT,
};
