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

// EXIF 표시 방향(Orientation, TIFF tag 0x0112). 값이 없거나 읽을 수 없으면 1(회전 없음)이다.
// 서명은 "화면 배치" 를 말하므로 저장 픽셀이 아니라 **보이는 방향** 으로 재야 한다. 같은 픽셀에
// orientation 1 과 6 을 붙인 두 파일은 저장 픽셀 거리가 정확히 0 이지만 화면에서는 90도 다르고,
// 반대로 메타데이터로 돌린 사진과 픽셀을 물리 회전한 사진은 같아 보이는데 거리가 멀어진다(#182 리뷰 Major 2).
// 여기서 읽는 것은 APP1/Exif 헤더의 IFD0 한 태그뿐이다. 새 의존성은 없다.
export function exifOrientation(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
  const view = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  for (let p = 2; p + 4 <= view.length && view[p] === 0xFF;) {
    const marker = view[p + 1];
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { p += 2; continue; }
    if (marker === 0xDA) return 1;                       // scan start — no EXIF before the pixels
    const size = view.readUInt16BE(p + 2);
    if (size < 2 || p + 2 + size > view.length) return 1;
    if (marker === 0xE1 && view.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
      const tiff = p + 10;
      const le = view.toString('latin1', tiff, tiff + 2) === 'II';
      const u16 = at => (le ? view.readUInt16LE(at) : view.readUInt16BE(at));
      const u32 = at => (le ? view.readUInt32LE(at) : view.readUInt32BE(at));
      if (tiff + 8 > view.length || u16(tiff + 2) !== 0x002A) return 1;
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > view.length) return 1;
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > view.length) return 1;
        if (u16(entry) !== 0x0112) continue;
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
      }
      return 1;
    }
    p += 2 + size;
  }
  return 1;
}

// 8칸짜리 EXIF 방향을 8x8 격자 좌표 변환으로 옮긴다. 1=그대로, 2=좌우반전, 3=180도, 4=상하반전,
// 5=전치, 6=시계 90도, 7=반전전치, 8=반시계 90도 (EXIF 표준 정의).
const ORIENT = {
  1: (r, c) => [r, c],
  2: (r, c) => [r, SIGNATURE_SIDE - 1 - c],
  3: (r, c) => [SIGNATURE_SIDE - 1 - r, SIGNATURE_SIDE - 1 - c],
  4: (r, c) => [SIGNATURE_SIDE - 1 - r, c],
  5: (r, c) => [c, r],
  6: (r, c) => [SIGNATURE_SIDE - 1 - c, r],
  7: (r, c) => [SIGNATURE_SIDE - 1 - c, SIGNATURE_SIDE - 1 - r],
  8: (r, c) => [c, SIGNATURE_SIDE - 1 - r]
};

/** 저장 픽셀 기준 64칸 서명을 표시 방향 64칸으로 옮긴다. 정사각 격자라 값은 보존되고 자리만 바뀐다. */
export function orientSignature(cells, orientation) {
  const map = ORIENT[orientation];
  if (!Array.isArray(cells) || !map || orientation === 1) return cells;
  const out = new Array(cells.length);
  for (let r = 0; r < SIGNATURE_SIDE; r++) for (let c = 0; c < SIGNATURE_SIDE; c++) {
    const [sr, sc] = map(r, c);
    out[r * SIGNATURE_SIDE + c] = cells[sr * SIGNATURE_SIDE + sc];
  }
  return out;
}
