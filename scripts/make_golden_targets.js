// Regenerates eval/golden/case_01 target profiles from lib/target_profile.js and
// mirrors them into the ordered feeds, so the golden set is never hand-edited JSON.
import { writeFile, readFile } from 'node:fs/promises';
import { extractFromReference, extractFromFreetext } from '../lib/target_profile.js';
import { validateProfile, validateFeed } from '../lib/contracts.js';

const root = new URL('../eval/golden/case_01/', import.meta.url);
const at = '2026-09-17T00:00:00.000Z';
const write = (name, value) => writeFile(new URL(name, root), JSON.stringify(value, null, 2) + '\n');
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));

const cases = {
  quiet: await extractFromFreetext('조용하고 짧게, 이모지 없이 해요체로', { profileId: 'tgt_quiet_freetext', createdAt: at }),
  detail: await extractFromReference('https://www.instagram.com/29cm/', { profileId: 'tgt_detail_ig_29cm', createdAt: at })
};
const input = await read('input.json');
const currentProfile = await read('current_profile.json');

for (const [name, profile] of Object.entries(cases)) {
  validateProfile(profile, 'target');
  await write(`target_${name}.json`, profile);
  // The feed's applied_profile is a mirror of the target; regenerate it instead of letting it drift.
  const feed = await read(`ordered_${name}.json`);
  Object.assign(feed.applied_profile, {
    target_profile_id: profile.profile_id,
    visual: profile.visual,
    language: profile.language,
    sequence: profile.sequence
  });
  validateFeed(feed, input.photo_ids, currentProfile);
  await write(`ordered_${name}.json`, feed);
  console.log(`${name}: ${profile.profile_id} source=${profile.source} completeness=${JSON.stringify(profile.completeness)}`);
}
