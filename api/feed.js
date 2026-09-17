import { readFile } from 'node:fs/promises';
import { validateFeed, validatePhoto, validateProfile } from '../lib/contracts.js';

const names = ['ordered_feed', 'photo_analysis', 'target_profile', 'current_profile'];
const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.sample.json`, import.meta.url), 'utf8'));

export async function mockResource(name = 'ordered_feed') {
  if (!names.includes(name)) throw new Error('Unknown mock resource');
  const [feed, photos, targets, currents] = await Promise.all(names.map(read));
  photos.forEach(validatePhoto);
  targets.forEach(p => validateProfile(p,'target'));
  currents.forEach(p => validateProfile(p,'current'));
  // Independent photo input, never feed.invariants or feed.slots as the oracle.
  // Mock input convention: the first target in the fixture list is the applied one.
  // The output's own target_profile_id is never used to pick its own oracle.
  validateFeed(feed, photos.map(p => p.photo_id), currents.find(p => !p.present), targets[0], photos);
  return { ordered_feed: feed, photo_analysis: photos, target_profile: targets, current_profile: currents }[name];
}

export default async function handler(req, res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  const send = (status, body) => { res.statusCode=status; res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return send(405,{error:{code:'METHOD_NOT_ALLOWED'}}); }
  const url = new URL(req.url,'http://localhost');
  if (!url.searchParams.has('mock')) return send(501,{error:{code:'LIVE_NOT_IMPLEMENTED',message:'Live generation is not implemented; use ?mock=1 for synthetic fixtures.'}});
  if (url.searchParams.getAll('mock').length!==1 || url.searchParams.get('mock')!=='1') return send(400,{error:{code:'INVALID_MOCK'}});
  const resource=url.searchParams.get('resource') ?? 'ordered_feed';
  if(!names.includes(resource) || url.searchParams.getAll('resource').length>1) return send(400,{error:{code:'INVALID_RESOURCE'}});
  try { return send(200,await mockResource(resource)); }
  catch { return send(500,{error:{code:'INVALID_FIXTURE',message:'Mock fixture failed contract validation.'}}); }
}
