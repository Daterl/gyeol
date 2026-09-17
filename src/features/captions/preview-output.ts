import type {
  CaptionSlot,
  GenerateRequest,
  GenerateResponse,
} from '@/types/contracts';
import {
  validateGenerateRequest,
  validateGenerateResponse,
} from '../../../lib/interaction.js';
import { ApiError } from '../../lib/api';

// Deterministic QA replay, never a model-quality result. Uses only this request's facts and IDs.
export async function previewOutput(
  input: GenerateRequest,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  signal?.throwIfAborted();
  validateGenerateRequest(input);
  const slots: CaptionSlot[] = input.feed.slots.map((slot, index) => {
    const fact = slot.caption_inputs.describable_facts[0];
    const filled = Boolean(fact) && (input.mode === 'slot' || index % 3 !== 1);
    return {
      photo_id: slot.photo_id,
      position: slot.position,
      evidence: [
        {
          kind: 'uploaded_photo',
          ref: slot.photo_id,
          note: fact || '문장으로 옮길 수 있는 관찰이 없어요.',
        },
      ],
      ...(filled
        ? { caption_state: 'filled' as const, text: fact, omit_reason: null }
        : {
            caption_state: 'omitted' as const,
            text: null,
            omit_reason: fact
              ? '사진을 먼저 볼 수 있도록 이 자리는 말없이 두어 봤어요.'
              : '사진에서 확인한 내용이 적어 말을 보태지 않았어요.',
          }),
    };
  });
  const selected =
    input.mode === 'slot'
      ? slots.find((slot) => slot.photo_id === input.photo_id)
      : undefined;
  if (input.mode === 'slot' && !selected)
    throw new Error('Missing requested slot');
  if (input.mode === 'slot' && selected?.caption_state === 'omitted')
    throw new ApiError(
      'NO_OBSERVATION',
      '확인한 내용이 적어 예시 문장을 채울 수 없어요. 직접 써 주세요.',
    );
  const result: GenerateResponse = selected
    ? { slot: selected }
    : { output: { title: '사진으로 남긴 기록', slots } };
  validateGenerateResponse(result, input);
  return result;
}
