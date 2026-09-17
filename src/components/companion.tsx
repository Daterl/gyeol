import Image from 'next/image';

export function Companion({
  state,
}: {
  state: 'default' | 'working' | 'complete' | 'recovery';
}) {
  return (
    <span
      aria-hidden="true"
      className="hidden size-16 shrink-0 min-[360px]:block sm:size-24"
    >
      <Image
        src={`/images/gyeol-character/${state}.webp`}
        alt=""
        width={96}
        height={96}
        unoptimized
        className="size-full object-contain"
      />
    </span>
  );
}
