import type { Claim, F3Export, OrderedFeed } from '@/types/contracts';

type FeedSlot = OrderedFeed['slots'][number];
// 자리별 배치 근거와 묶음 컨셉을 photo_id 로 묶어 둔다. 재정렬·캡션 편집은 슬롯의
// position·text 만 바꾸므로, photo_id 로 찾으면 처음 제안한 자리의 설명이 그대로 남는다.
export type ExportCuration = {
  narrative_role: FeedSlot['narrative_role'];
  photo_id: string;
  proposed_position: number;
  rationale: Claim<string>;
};
// F3Export 에 더하기만 한다. 기존 소비자가 읽던 title·slots 는 모양이 그대로다.
export type ExportPayload = F3Export & {
  concept?: Claim<string>;
  curation: ExportCuration[];
  curation_schema_version: '1.0';
};

export function exportPayload(
  output: F3Export,
  feed: OrderedFeed,
): ExportPayload {
  return {
    ...output,
    ...(feed.concept ? { concept: feed.concept } : {}),
    curation_schema_version: '1.0',
    curation: output.slots.map((slot) => {
      const source = feed.slots.find((item) => item.photo_id === slot.photo_id);
      if (!source) throw new Error('Missing placement rationale');
      return {
        narrative_role: source.narrative_role,
        photo_id: source.photo_id,
        proposed_position: source.position,
        rationale: source.rationale,
      };
    }),
  };
}

const notes = (claim: Claim<string>) =>
  claim.evidence.map((evidence) => evidence.note).join(' / ');

export function exportText(output: F3Export, feed: OrderedFeed) {
  const payload = exportPayload(output, feed);
  const curation = new Map(
    payload.curation.map((item) => [item.photo_id, item]),
  );
  return [
    payload.title,
    ...(payload.concept
      ? [
          `묶음 컨셉: ${payload.concept.value}\n묶음 근거: ${notes(payload.concept)}`,
        ]
      : []),
    ...payload.slots.map((slot) => {
      const placement = curation.get(slot.photo_id);
      return [
        `${String(slot.position).padStart(2, '0')} · ${slot.photo_id}`,
        slot.caption_state === 'seed'
          ? `[AI 쓸 거리]\n${slot.text}`
          : slot.caption_state === 'user'
            ? `[내 문장] ${slot.text}`
            : `[비움] ${slot.omit_reason}`,
        `근거: ${slot.evidence.map((evidence) => evidence.note).join(' / ')}`,
        ...(placement
          ? [
              `처음 제안 ${placement.proposed_position}번 · ${placement.narrative_role}`,
              `자리 근거: ${placement.rationale.value}`,
              `자리 근거 출처: ${notes(placement.rationale)}`,
            ]
          : []),
      ].join('\n');
    }),
  ].join('\n\n');
}
export function downloadOutput(
  output: F3Export,
  feed: OrderedFeed,
  format: 'json' | 'txt',
) {
  const text =
    format === 'json'
      ? JSON.stringify(exportPayload(output, feed), null, 2)
      : exportText(output, feed);
  const url = URL.createObjectURL(
    new Blob([text], {
      type:
        format === 'json'
          ? 'application/json;charset=utf-8'
          : 'text/plain;charset=utf-8',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gyeol.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
