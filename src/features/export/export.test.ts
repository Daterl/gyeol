import { afterEach, expect, test, vi } from 'vitest';
import type { F3Export, OrderedFeed } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import { downloadOutput, exportPayload, exportText } from './export';

afterEach(() => {
  vi.unstubAllGlobals();
});

const feed = () => structuredClone(fixture.feed) as unknown as OrderedFeed;
const output = () => structuredClone(fixture.output) as unknown as F3Export;

const grow = (count: number) => {
  const base = feed();
  const draft = output();
  const slots = Array.from({ length: count }, (_, index) => {
    const id = `ph_${String(index + 1).padStart(2, '0')}`;
    const source = base.slots[index % base.slots.length];
    return {
      ...structuredClone(source),
      photo_id: id,
      position: index + 1,
      rationale: {
        ...structuredClone(source.rationale),
        value: `${id} 자리 설명`,
        evidence: [
          { kind: 'uploaded_photo' as const, ref: id, note: `${id} 측정` },
        ],
      },
    };
  });
  return {
    feed: {
      ...base,
      concept: {
        value: '밝고 어두운 화면이 어우러지는 흐름으로 엮어요.',
        confidence: 1,
        evidence: [
          {
            kind: 'rule' as const,
            ref: 'order.bundle_concept',
            note: '밝기 범위 측정',
          },
        ],
      },
      slots,
    } satisfies OrderedFeed,
    output: {
      ...draft,
      slots: slots.map((slot, index) => ({
        ...structuredClone(draft.slots[index % draft.slots.length]),
        photo_id: slot.photo_id,
        position: index + 1,
      })),
    } as F3Export,
  };
};

test('3장 피드는 자리 근거를 photo_id 로 보존하고 컨셉이 없으면 내지 않는다', () => {
  const payload = exportPayload(output(), feed());
  expect(payload.curation_schema_version).toBe('1.0');
  expect('concept' in payload).toBe(false);
  expect(payload.curation.map((item) => item.photo_id)).toEqual([
    'ph_01',
    'ph_02',
    'ph_03',
  ]);
  expect(payload.curation[0].rationale.value).toBe(
    feed().slots[0].rationale.value,
  );
  expect(payload.curation[0].proposed_position).toBe(1);
  // 기존 계약은 그대로다.
  expect(payload.title).toBe(fixture.output.title);
  expect(payload.slots).toEqual(output().slots);
  const text = exportText(output(), feed());
  expect(text).toContain('자리 근거: 합성 입력 순서를 사용한 목업 자리');
  expect(text).toContain('처음 제안 1번 · opener');
  expect(text).not.toContain('묶음 컨셉');
});

test('15장 재정렬·캡션 편집 뒤에도 근거가 photo_id 를 따라간다', () => {
  const { feed: grown, output: draft } = grow(15);
  // 사용자가 마지막 사진을 맨 앞으로 옮기고 그 문장을 직접 고쳤다.
  const moved = draft.slots.at(-1);
  if (!moved) throw new Error('no slot');
  const reordered: F3Export = {
    ...draft,
    slots: [
      {
        ...moved,
        caption_state: 'user',
        omit_reason: null,
        text: '내가 쓴 문장',
      },
      ...draft.slots.slice(0, -1),
    ].map((slot, index) => ({ ...slot, position: index + 1 })),
  } as F3Export;
  const payload = exportPayload(reordered, grown);
  expect(payload.curation).toHaveLength(15);
  expect(payload.curation[0]).toMatchObject({
    photo_id: 'ph_15',
    proposed_position: 15,
  });
  expect(payload.curation[0].rationale.value).toBe('ph_15 자리 설명');
  expect(payload.concept?.value).toContain('어우러지는');
  for (const item of payload.curation)
    expect(item.rationale.evidence[0].ref).toBe(item.photo_id);
  const text = exportText(reordered, grown);
  expect(text).toContain(
    '묶음 컨셉: 밝고 어두운 화면이 어우러지는 흐름으로 엮어요.',
  );
  expect(text).toContain(`01 · ph_15\n[내 문장] 내가 쓴 문장`);
  expect(text).toContain('처음 제안 15번');
  expect(text).toContain('자리 근거: ph_15 자리 설명');
});

test('실제 다운로드가 근거를 담은 파일을 만든다', async () => {
  const blobs: Blob[] = [];
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => {
      blobs.push(blob);
      return 'blob:gyeol';
    },
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('document', {
    createElement: () => anchor,
    body: { append: vi.fn(), remove: vi.fn() },
  });
  const { feed: grown, output: draft } = grow(15);
  downloadOutput(draft, grown, 'json');
  downloadOutput(draft, grown, 'txt');
  expect(anchor.click).toHaveBeenCalledTimes(2);
  expect(anchor.download).toBe('gyeol.txt');
  const json = JSON.parse(await blobs[0].text());
  expect(json.curation).toHaveLength(15);
  expect(json.concept.value).toContain('어우러지는');
  expect(json.slots).toHaveLength(15);
  expect(await blobs[1].text()).toContain('자리 근거: ph_01 자리 설명');
  expect(blobs[0].type).toBe('application/json;charset=utf-8');
  expect(blobs[1].type).toBe('text/plain;charset=utf-8');
});
