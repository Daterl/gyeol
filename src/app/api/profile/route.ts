import { handleProfileConnection } from '../../../../lib/profile-connection.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function profile(request: Request) {
  return handleProfileConnection(request);
}

export {
  profile as DELETE,
  profile as GET,
  profile as HEAD,
  profile as OPTIONS,
  profile as PATCH,
  profile as POST,
  profile as PUT,
};
