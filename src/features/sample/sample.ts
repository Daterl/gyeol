export type SampleSlot = {
  photo_id: string;
  position: number;
  rationale: { evidence: { note: string }[]; value: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSampleSlot(value: unknown): value is SampleSlot {
  return (
    isRecord(value) &&
    typeof value.photo_id === 'string' &&
    value.photo_id.length > 0 &&
    typeof value.position === 'number' &&
    Number.isInteger(value.position) &&
    isRecord(value.rationale) &&
    typeof value.rationale.value === 'string' &&
    Array.isArray(value.rationale.evidence) &&
    value.rationale.evidence.length > 0 &&
    value.rationale.evidence.every(
      (item) => isRecord(item) && typeof item.note === 'string',
    )
  );
}

export async function loadSample(signal: AbortSignal): Promise<SampleSlot[]> {
  const response = await fetch('/api/feed?mock=1', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok)
    throw new Error('샘플을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  const data: unknown = await response.json();
  if (
    !isRecord(data) ||
    !Array.isArray(data.slots) ||
    data.slots.length === 0 ||
    !data.slots.every(isSampleSlot)
  ) {
    throw new Error('샘플 형식을 확인할 수 없어요. 다시 시도해 주세요.');
  }
  const slots = data.slots.toSorted((a, b) => a.position - b.position);
  if (
    slots.some((slot, index) => slot.position !== index + 1) ||
    new Set(slots.map((slot) => slot.photo_id)).size !== slots.length
  ) {
    throw new Error('샘플 순서를 확인할 수 없어요. 다시 시도해 주세요.');
  }
  return slots;
}
