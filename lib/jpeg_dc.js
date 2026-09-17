// JPEG DC-only reader. Node built-ins only — this repo keeps zero dependencies
// (scripts/check.js fails if package.json declares any), so an image decoder is
// not available and the heuristic fallback still has to report measured pixels.
//
// Only the DC coefficient is read because the DC coefficient IS the block mean:
// the JPEG forward DCT defines S00 = (1/8) * sum(pixel - 128) over the 8x8 block,
// so mean_pixel = dequantized_DC / 8 + 128. That yields a real 8x-downscaled image
// without an IDCT, without chroma upsampling and without touching AC coefficients.
// Baseline (SOF0/SOF1) and progressive (SOF2, DC first scan) are both read; real
// Instagram images are progressive. Anything else returns null — the caller must
// fail honestly rather than invent color.

const MAX_HUFF_BITS = 16;

class BitReader {
  constructor(bytes, pos) { this.bytes = bytes; this.pos = pos; this.buf = 0; this.bits = 0; this.eos = false; }
  bit() {
    if (this.bits === 0) {
      if (this.pos >= this.bytes.length) { this.eos = true; return -1; }
      let byte = this.bytes[this.pos++];
      if (byte === 0xFF) {
        const next = this.bytes[this.pos];
        if (next === 0x00) this.pos++;                        // stuffed 0xFF
        else { this.pos--; this.eos = true; return -1; }      // a real marker ends the scan
      }
      this.buf = byte; this.bits = 8;
    }
    this.bits--;
    return (this.buf >> this.bits) & 1;
  }
  receive(n) { let v = 0; for (let i = 0; i < n; i++) { const b = this.bit(); if (b < 0) return v << (n - i); v = (v << 1) | b; } return v; }
  align() { this.bits = 0; }
}

function buildHuffman(counts, symbols) {
  const table = new Map();
  let code = 0, k = 0;
  for (let len = 1; len <= MAX_HUFF_BITS; len++) {
    for (let i = 0; i < counts[len - 1]; i++) table.set((len << 16) | code++, symbols[k++]);
    code <<= 1;
  }
  return table;
}
function decodeHuffman(reader, table) {
  let code = 0;
  for (let len = 1; len <= MAX_HUFF_BITS; len++) {
    const b = reader.bit();
    if (b < 0) return -1;
    code = (code << 1) | b;
    const symbol = table.get((len << 16) | code);
    if (symbol !== undefined) return symbol;
  }
  return -1;
}
const extend = (v, n) => (n === 0 ? 0 : v < 1 << (n - 1) ? v - (1 << n) + 1 : v);

// Entropy-coded data holds no length field; walk to the next non-stuffed, non-restart marker.
function skipEntropy(bytes, from) {
  let p = from;
  while (p < bytes.length - 1) {
    if (bytes[p] === 0xFF) {
      const m = bytes[p + 1];
      if (m !== 0x00 && m !== 0xFF && !(m >= 0xD0 && m <= 0xD7)) return p;
      p += 2;
    } else p++;
  }
  return bytes.length;
}

function decodeDcScan(bytes, start, frame, scan, shift, quant, restartInterval) {
  const hMax = Math.max(...frame.components.map(c => c.h));
  const vMax = Math.max(...frame.components.map(c => c.v));
  const mcusX = Math.ceil(frame.width / (8 * hMax));
  const mcusY = Math.ceil(frame.height / (8 * vMax));
  for (const c of frame.components) {
    if (quant[c.tq] === undefined) return null;               // DQT must precede SOS
    c.bw = mcusX * c.h; c.bh = mcusY * c.v;
    c.usedW = Math.ceil(Math.ceil((frame.width * c.h) / hMax) / 8);
    c.usedH = Math.ceil(Math.ceil((frame.height * c.v) / vMax) / 8);
    c.grid = new Float64Array(c.bw * c.bh);
  }
  const reader = new BitReader(bytes, start);
  const predictors = new Array(scan.length).fill(0);
  const total = mcusX * mcusY;
  let decoded = 0;
  for (let mcu = 0; mcu < total; mcu++) {
    if (restartInterval && mcu > 0 && mcu % restartInterval === 0) {
      reader.align();
      let p = reader.pos;
      while (p < bytes.length - 1 && !(bytes[p] === 0xFF && bytes[p + 1] >= 0xD0 && bytes[p + 1] <= 0xD7)) p++;
      if (p >= bytes.length - 1) break;
      reader.pos = p + 2; reader.eos = false; predictors.fill(0);
    }
    const my = Math.floor(mcu / mcusX), mx = mcu % mcusX;
    for (let i = 0; i < scan.length; i++) {
      const c = scan[i].component;
      for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) {
        const size = decodeHuffman(reader, scan[i].dcTable);
        if (size < 0) { reader.eos = true; break; }
        predictors[i] += size > 0 ? extend(reader.receive(size), size) : 0;
        c.grid[(my * c.v + v) * c.bw + mx * c.h + h] = ((predictors[i] << shift) * quant[c.tq]) / 8 + 128;
      }
    }
    if (reader.eos) break;
    decoded = mcu + 1;
  }
  // A truncated scan leaves later blocks at 0; require most of the image before trusting it.
  if (decoded < total * 0.9) return null;
  return {
    width: frame.width, height: frame.height, progressive: frame.progressive,
    components: frame.components.map(c => ({ id: c.id, h: c.h, v: c.v, bw: c.bw, bh: c.bh, usedW: c.usedW, usedH: c.usedH, grid: c.grid }))
  };
}

/**
 * Read the 8x8-block mean pixel values of a JPEG.
 * @returns {{width:number,height:number,progressive:boolean,components:Array}|null}
 *   null when the file is not a JPEG this reader can decode. Never a guess.
 */
export function readJpegBlocks(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  const quant = [], huffDC = [], huffAC = [];
  let frame = null, restartInterval = 0, pos = 2;
  while (pos < bytes.length - 1) {
    if (bytes[pos] !== 0xFF) { pos++; continue; }
    const marker = bytes[pos + 1];
    if (marker === 0xFF) { pos++; continue; }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { pos += 2; continue; }
    if (marker === 0xD9) break;
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (length < 2) return null;
    const seg = pos + 4, segEnd = pos + 2 + length;
    if (segEnd > bytes.length) return null;
    if (marker === 0xDB) {                                     // DQT
      let p = seg;
      while (p < segEnd) {
        const precision = bytes[p] >> 4, id = bytes[p] & 15; p++;
        quant[id] = precision ? (bytes[p] << 8) | bytes[p + 1] : bytes[p];   // element 0 is DC
        p += precision ? 128 : 64;
      }
    } else if (marker === 0xC4) {                              // DHT
      let p = seg;
      while (p < segEnd) {
        const kind = bytes[p] >> 4, id = bytes[p] & 15; p++;
        const counts = Array.from(bytes.subarray(p, p + 16)); p += 16;
        const n = counts.reduce((a, b) => a + b, 0);
        const table = buildHuffman(counts, Array.from(bytes.subarray(p, p + n))); p += n;
        (kind === 0 ? huffDC : huffAC)[id] = table;
      }
    } else if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {       // SOF0/1/2
      if (bytes[seg] !== 8) return null;                       // 8-bit precision only
      frame = {
        progressive: marker === 0xC2,
        height: (bytes[seg + 1] << 8) | bytes[seg + 2],
        width: (bytes[seg + 3] << 8) | bytes[seg + 4],
        components: Array.from({ length: bytes[seg + 5] }, (_, i) => ({
          id: bytes[seg + 6 + i * 3], h: bytes[seg + 7 + i * 3] >> 4, v: bytes[seg + 7 + i * 3] & 15, tq: bytes[seg + 8 + i * 3]
        }))
      };
      if (!frame.width || !frame.height || !frame.components.length) return null;
      if (frame.components.some(c => !c.h || !c.v)) return null;
    } else if ((marker >= 0xC3 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8) {
      return null;                                             // lossless / arithmetic / hierarchical
    } else if (marker === 0xDD) {
      restartInterval = (bytes[seg] << 8) | bytes[seg + 1];
    } else if (marker === 0xDA) {                              // SOS
      const count = bytes[seg];
      const scan = [];
      for (let i = 0; i < count; i++) {
        const id = bytes[seg + 1 + i * 2], tables = bytes[seg + 2 + i * 2];
        const component = frame?.components.find(c => c.id === id);
        if (!component) return null;
        scan.push({ component, dcTable: huffDC[tables >> 4] });
      }
      const ss = bytes[seg + 1 + count * 2], ah = bytes[seg + 3 + count * 2] >> 4, al = bytes[seg + 3 + count * 2] & 15;
      const usable = frame && scan.length === frame.components.length && scan.every(s => s.dcTable)
        && (frame.progressive ? ss === 0 && ah === 0 : true);
      if (usable) {
        const result = decodeDcScan(bytes, segEnd, frame, scan, frame.progressive ? al : 0, quant, restartInterval);
        if (result) return result;
      }
      pos = skipEntropy(bytes, segEnd);
      continue;
    }
    pos = segEnd;
  }
  return null;
}
