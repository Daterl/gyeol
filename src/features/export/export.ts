import type { F3Export } from '@/types/contracts';

export function exportText(output: F3Export) {
  return [
    output.title,
    ...output.slots.map(
      (slot) =>
        `${String(slot.position).padStart(2, '0')} · ${slot.photo_id}\n${slot.text ?? `[비움] ${slot.omit_reason}`}\n근거: ${slot.evidence.map((evidence) => evidence.note).join(' / ')}`,
    ),
  ].join('\n\n');
}
export function downloadOutput(output: F3Export, format: 'json' | 'txt') {
  const text =
    format === 'json' ? JSON.stringify(output, null, 2) : exportText(output);
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
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
