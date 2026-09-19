// 구조 서명(structure signature). 사진에서 실제로 관측한 값만 담는다.
//
// #97 이 묻는 "비슷한 사진" 을 PhotoAnalysis 의 기존 관측값으로 판정할 수 없다는 것이 실측 결과다
// (docs/specs/97-exclusion-quality/report.md 2절, 실사진 291장 42,195쌍).
// 평균 색(밝기·채도·색상각)은 같은 게시물 쌍과 다른 게시물 쌍을 5:1 로밖에 가르지 못했고,
// 가장 가까운 두 쌍을 눈으로 열어 보니 둘 다 서로 무관한 사진이었다.
//
// 여기서 쓰는 값은 분석기가 이미 디코드하는 JPEG DC 블록(lib/jpeg_dc.js)의 밝기 격자다.
// 새 의존성도, 모델 호출도, 추가 디코딩도 없다. 8x8 로 줄이고 대비 정규화(z-score)하므로
// 노출이 아니라 화면 배치를 말한다 — 같은 장면을 밝기만 다르게 찍은 두 장은 가까워지고,
// 우연히 평균 밝기가 같은 무관한 두 장은 멀어진다.
export const SIGNATURE_SIDE = 8;

// 대비가 이만큼도 없으면 "배치"라고 부를 구조가 화면에 없다. 그때는 서명을 내지 않는다 —
// 전부 0 인 서명끼리는 거리가 0 이라 단색 카드 두 장이 서로 "비슷한 사진" 으로 잡힌다.
// 단위는 JPEG DC 밝기(0..255)의 표준편차다.
export const MIN_STRUCTURE_SPREAD = 4;

/**
 * 밝기 블록 격자 → 64칸 대비 정규화 서명. 구조가 없으면 null 이다(추측하지 않는다).
 * @param {{grid:Float64Array,bw:number,usedW:number,usedH:number}} luma
 */
export function structureSignature(luma) {
  if (!luma?.usedW || !luma?.usedH) return null;
  const cells = [];
  for (let row = 0; row < SIGNATURE_SIDE; row++) for (let col = 0; col < SIGNATURE_SIDE; col++) {
    const y0 = Math.floor((row * luma.usedH) / SIGNATURE_SIDE), y1 = Math.max(y0 + 1, Math.floor(((row + 1) * luma.usedH) / SIGNATURE_SIDE));
    const x0 = Math.floor((col * luma.usedW) / SIGNATURE_SIDE), x1 = Math.max(x0 + 1, Math.floor(((col + 1) * luma.usedW) / SIGNATURE_SIDE));
    let sum = 0, count = 0;
    for (let y = Math.min(y0, luma.usedH - 1); y < Math.min(y1, luma.usedH); y++)
      for (let x = Math.min(x0, luma.usedW - 1); x < Math.min(x1, luma.usedW); x++) { sum += luma.grid[y * luma.bw + x]; count++; }
    if (!count) return null;
    cells.push(sum / count);
  }
  const mean = cells.reduce((a, v) => a + v, 0) / cells.length;
  const spread = Math.sqrt(cells.reduce((a, v) => a + (v - mean) ** 2, 0) / cells.length);
  if (!Number.isFinite(spread) || spread < MIN_STRUCTURE_SPREAD) return null;
  return cells.map(v => Number(((v - mean) / spread).toFixed(3)));
}

/** 두 서명 사이의 RMS 거리. 길이가 다르면 비교하지 않는다. */
export function signatureDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  return Number(Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) / a.length).toFixed(4));
}
