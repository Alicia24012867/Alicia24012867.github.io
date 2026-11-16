/**
 * QR codes for the site's own addresses, as ISO/IEC 18004 describes them: text is encoded as
 * UTF-8 bytes in the smallest version that holds it, at error correction level M or, when it
 * still fits, a stronger one.
 */

export type Correction = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  /** Modules along each side, without the quiet zone around them. */
  size: number;
  dark(x: number, y: number): boolean;
}

const levels: Correction[] = ['L', 'M', 'Q', 'H'];
/** The two bits each level is written with in the format information. */
const formatBits: Record<Correction, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Per version 1–40 (index 0 unused): error correction codewords in each block, and blocks.
const eccPerBlock: Record<Correction, number[]> = {
  L: [
    0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
    30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
    30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};
const blockCount: Record<Correction, number[]> = {
  L: [
    0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14,
    15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
    26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34,
    34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37,
    40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

/** Modules left for data and error correction once the fixed patterns are drawn. */
function rawModules(version: number) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}
const dataCodewords = (version: number, level: Correction) =>
  Math.floor(rawModules(version) / 8) - eccPerBlock[level][version] * blockCount[level][version];
/** Bits a byte-mode segment of `length` bytes takes, mode and count included. */
const segmentBits = (version: number, length: number) => 4 + (version <= 9 ? 8 : 16) + 8 * length;

// Arithmetic in GF(2^8) over x^8 + x^4 + x^3 + x^2 + 1, as Reed–Solomon codes for QR use it.
function multiply(x: number, y: number) {
  let z = 0;
  for (let bit = 7; bit >= 0; bit--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> bit) & 1) * x;
  }
  return z;
}
function divisor(degree: number) {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}
function remainder(data: number[], by: number[]) {
  const result = by.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    by.forEach((coefficient, i) => {
      result[i] ^= multiply(coefficient, factor);
    });
  }
  return result;
}

/** The data codewords split into blocks, each followed by its error correction, interleaved. */
function interleave(data: number[], version: number, level: Correction) {
  const blocks = blockCount[level][version];
  const eccLength = eccPerBlock[level][version];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const by = divisor(eccLength);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const ecc = remainder(block, by);
    // Short blocks hold one codeword less; a placeholder keeps the columns aligned.
    if (i < shortBlocks) block.push(0);
    all.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < all[0].length; i++)
    all.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]);
    });
  return result;
}

function alignmentPositions(version: number) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const positions = [6];
  for (let position = version * 4 + 10; positions.length < count; position -= step)
    positions.splice(1, 0, position);
  return positions;
}

const masks: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  readonly fixed: boolean[][];
  constructor(size: number) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  set(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.fixed[y][x] = true;
  }
}

function drawPatterns(matrix: Matrix, version: number) {
  const { size } = matrix;
  for (let i = 0; i < size; i++) {
    matrix.set(6, i, i % 2 === 0);
    matrix.set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size)
          matrix.set(x, y, distance !== 2 && distance !== 4);
      }
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((cy, i) =>
    positions.forEach((cx, j) => {
      // The three corners are taken by the finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          matrix.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  // Reserve the format areas for now; the real bits go in once the mask is chosen.
  drawFormat(matrix, 'M', 0);
  if (version >= 7) {
    let rest = version;
    for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const bits = (version << 12) | rest;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      matrix.set(a, b, dark);
      matrix.set(b, a, dark);
    }
  }
}

function drawFormat(matrix: Matrix, level: Correction, mask: number) {
  const { size } = matrix;
  const data = (formatBits[level] << 3) | mask;
  let rest = data;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  const bits = ((data << 10) | rest) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) matrix.set(8, i, bit(i));
  matrix.set(8, 7, bit(6));
  matrix.set(8, 8, bit(7));
  matrix.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) matrix.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) matrix.set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) matrix.set(8, size - 15 + i, bit(i));
  matrix.set(8, size - 8, true);
}

/** Lays the codewords out in two-module columns, zigzagging up and down from the right. */
function drawData(matrix: Matrix, codewords: number[]) {
  const { size } = matrix;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (matrix.fixed[y][x] || i >= codewords.length * 8) continue;
        matrix.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
  }
}

function applyMask(matrix: Matrix, mask: number) {
  const test = masks[mask];
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (!matrix.fixed[y][x] && test(x, y)) matrix.modules[y][x] = !matrix.modules[y][x];
}

/** How hard a masked code is to scan, by the four rules of the standard: lower is better. */
function penalty({ modules, size }: Matrix) {
  let score = 0;
  // A run of light modules and its neighbours that look like a finder pattern, in either order.
  const finderLike = (runs: number[]) => {
    const n = runs[1];
    const core = n > 0 && runs[2] === n && runs[3] === n * 3 && runs[4] === n && runs[5] === n;
    return (
      (core && runs[0] >= n * 4 && runs[6] >= n ? 1 : 0) +
      (core && runs[6] >= n * 4 && runs[0] >= n ? 1 : 0)
    );
  };
  const line = (at: (i: number) => boolean) => {
    const runs = [0, 0, 0, 0, 0, 0, 0];
    const push = (length: number) => {
      // The light quiet zone extends the first run.
      const first = runs[0] === 0;
      runs.pop();
      runs.unshift(first ? length + size : length);
    };
    let color = false;
    let length = 0;
    for (let i = 0; i < size; i++) {
      if (at(i) === color) {
        length++;
        if (length === 5) score += 3;
        else if (length > 5) score++;
      } else {
        push(length);
        if (!color) score += finderLike(runs) * 40;
        color = at(i);
        length = 1;
      }
    }
    if (color) {
      push(length);
      length = 0;
    }
    push(length + size);
    score += finderLike(runs) * 40;
  };
  for (let y = 0; y < size; y++) line((x) => modules[y][x]);
  for (let x = 0; x < size; x++) line((y) => modules[y][x]);
  let dark = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
      if (x < size - 1 && y < size - 1) {
        const color = modules[y][x];
        if (
          color === modules[y][x + 1] &&
          color === modules[y + 1][x] &&
          color === modules[y + 1][x + 1]
        )
          score += 3;
      }
    }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The QR code for `text`, at error correction level `least` or stronger. */
export function qrCode(text: string, least: Correction = 'M'): QrCode {
  const bytes = new TextEncoder().encode(text);
  let level = least;
  let version = 1;
  while (segmentBits(version, bytes.length) > dataCodewords(version, level) * 8) {
    if (++version > 40) throw new RangeError('Text too long for a QR code');
  }
  // A stronger level that still fits costs nothing.
  for (const stronger of levels.slice(levels.indexOf(least) + 1))
    if (segmentBits(version, bytes.length) <= dataCodewords(version, stronger) * 8)
      level = stronger;

  const capacity = dataCodewords(version, level) * 8;
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((byte) => append(byte, 8));
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

  const matrix = new Matrix(version * 4 + 17);
  drawPatterns(matrix, version);
  drawData(matrix, interleave(data, version, level));
  let best = 0;
  let lowest = Infinity;
  for (let mask = 0; mask < masks.length; mask++) {
    applyMask(matrix, mask);
    drawFormat(matrix, level, mask);
    const score = penalty(matrix);
    if (score < lowest) {
      best = mask;
      lowest = score;
    }
    // Masking twice undoes it.
    applyMask(matrix, mask);
  }
  applyMask(matrix, best);
  drawFormat(matrix, level, best);
  return { size: matrix.size, dark: (x, y) => matrix.modules[y]?.[x] ?? false };
}

/** SVG path data drawing a code's dark modules, one unit each, row by row. */
export function qrPath(code: QrCode) {
  let path = '';
  for (let y = 0; y < code.size; y++)
    for (let x = 0; x < code.size; x++) {
      if (!code.dark(x, y)) continue;
      let run = 1;
      while (x + run < code.size && code.dark(x + run, y)) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run - 1;
    }
  return path;
}
