import type { CurationResponse } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';

export function curationFixture(): CurationResponse {
  return structuredClone({
    feed: fixture.feed,
    context: fixture.context,
    curation: {
      schema_version: '1.0',
      profile_snapshot_id: 'public-reference',
      profile: {
        snapshot_id: 'snapshot',
        source_url: 'https://www.instagram.com/public_example/',
        collected_at: '2026-09-18T10:00:00Z',
        expires_at: '2026-09-19T10:00:00Z',
        ownership_verified: false,
        evidence_refs: {},
      },
      prompt: { text: null, evidence: [] },
      slots: fixture.feed.slots.map((slot) => ({
        photo_id: slot.photo_id,
        position: slot.position,
        included: true,
        exclusion_candidate: {
          recommended: true,
          reason: '후보 근거',
          evidence: [],
        },
      })),
    },
  }) as CurationResponse;
}
