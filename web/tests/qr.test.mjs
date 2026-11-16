import test from 'node:test';
import assert from 'node:assert/strict';
import { qrCode, qrPath } from '../src/content/reader/qr.ts';

// A small reader, written from the standard (ISO/IEC 18004) apart from the encoder.
const versionOf = (code) => (code.size - 17) / 4;
const bitsAt = (code, places) =>
  places.reduce((bits, [x, y], i) => bits | (Number(code.dark(x, y)) << i), 0);
/** What is left of `bits` after dividing by the generator `by`, as BCH codes do. */
const bchRest = (bits, by, length) => {
  const degree = Math.floor(Math.log2(by));
  for (let i = length - 1; i >= degree; i--) if (bits & (1 << i)) bits ^= by << (i - degree);
  return bits;
};

/** The level and mask, from both copies of the format information beside the finders. */
function formatOf(code) {
  const { size } = code;
  const first = [
    ...[0, 1, 2, 3, 4, 5, 7, 8].map((y) => [8, y]),
    ...[7, 5, 4, 3, 2, 1, 0].map((x) => [x, 8]),
  ];
  const second = [
    ...Array.from({ length: 8 }, (_, i) => [size - 1 - i, 8]),
    ...Array.from({ length: 7 }, (_, i) => [8, size - 7 + i]),
  ];
  const bits = bitsAt(code, first);
  assert.equal(bitsAt(code, second), bits);
  const format = bits ^ 0b101010000010010;
  assert.equal(bchRest(format, 0x537, 15), 0);
  return { level: 'MLHQ'[format >> 13], mask: (format >> 10) & 7 };
}

/** The version, from both copies of the version information, which versions 7 and up carry. */
function versionInformation(code) {
  const { size } = code;
  const topRight = Array.from({ length: 18 }, (_, i) => [size - 11 + (i % 3), Math.floor(i / 3)]);
  const bits = bitsAt(code, topRight);
  assert.equal(
    bitsAt(
      code,
      topRight.map(([x, y]) => [y, x]),
    ),
    bits,
  );
  assert.equal(bchRest(bits, 0x1f25, 18), 0);
  return bits >> 12;
}

// Alignment pattern centres, rows and columns alike, for the versions read here.
const alignment = {
  1: [],
  2: [6, 18],
  5: [6, 30],
  7: [6, 22, 38],
  10: [6, 28, 50],
  40: [6, 30, 58, 86, 114, 142, 170],
};
// Error correction blocks: groups of [blocks, data codewords each], and the error correction
// codewords every block of the version and level ends with.
const blocks = {
  '1-M': [[[1, 16]], 10],
  '1-H': [[[1, 9]], 17],
  '2-M': [[[1, 28]], 16],
  '5-Q': [
    [
      [2, 15],
      [2, 16],
    ],
    18,
  ],
  '7-M': [[[4, 31]], 18],
  '10-H': [
    [
      [6, 15],
      [2, 16],
    ],
    28,
  ],
  '40-L': [
    [
      [19, 118],
      [6, 119],
    ],
    30,
  ],
};
// Masks by row i and column j.
const masks = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** Modules that carry no data: finders and format, timing, alignment and version. */
function functionModules(size, version) {
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const fill = (left, top, width, height) => {
    for (let y = top; y < top + height; y++)
      for (let x = left; x < left + width; x++) fixed[y][x] = true;
  };
  fill(0, 0, 9, 9);
  fill(size - 8, 0, 8, 9);
  fill(0, size - 8, 9, 8);
  fill(6, 0, 1, size);
  fill(0, 6, size, 1);
  const finder = (x, y) => (y < 9 && (x < 9 || x >= size - 8)) || (x < 9 && y >= size - 8);
  for (const y of alignment[version])
    for (const x of alignment[version]) if (!finder(x, y)) fill(x - 2, y - 2, 5, 5);
  if (version >= 7) {
    fill(size - 11, 0, 3, 6);
    fill(0, size - 11, 6, 3);
  }
  return fixed;
}

// Arithmetic in GF(256) by tables of powers of α = 2.
const exp = [];
const log = [];
for (let i = 0, x = 1; i < 255; i++) {
  exp[i] = x;
  log[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
const times = (a, b) => (a && b ? exp[(log[a] + log[b]) % 255] : 0);
/** Whether a block with `ecc` error correction codewords is zero at α^0 … α^(ecc − 1). */
const checksOut = (block, ecc) =>
  Array.from({ length: ecc }, (_, i) => block.reduce((sum, c) => times(sum, exp[i]) ^ c, 0)).every(
    (syndrome) => syndrome === 0,
  );

/** Reads a code back: its text, version and level, checking everything on the way. */
function read(code) {
  const { size } = code;
  const version = versionOf(code);
  const { level, mask } = formatOf(code);
  if (version >= 7) assert.equal(versionInformation(code), version);

  const fixed = functionModules(size, version);
  const bits = [];
  for (let right = size - 1, upward = true; right > 0; right -= 2, upward = !upward) {
    // The vertical timing pattern is skipped over.
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) {
      const y = upward ? size - 1 - k : k;
      for (const x of [right, right - 1])
        if (!fixed[y][x]) bits.push(Number(code.dark(x, y) !== masks[mask](y, x)));
    }
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    codewords.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

  const [groups, ecc] = blocks[`${version}-${level}`];
  const all = groups.flatMap(([count, length]) =>
    Array.from({ length: count }, () => ({ length, data: [], ecc: [] })),
  );
  assert.equal(
    codewords.length,
    all.reduce((sum, block) => sum + block.length + ecc, 0),
  );
  let k = 0;
  for (let i = 0; i < all.at(-1).length; i++)
    for (const block of all) if (i < block.length) block.data.push(codewords[k++]);
  for (let i = 0; i < ecc; i++) for (const block of all) block.ecc.push(codewords[k++]);
  for (const block of all) assert.ok(checksOut([...block.data, ...block.ecc], ecc));

  const stream = all.flatMap((block) =>
    block.data.flatMap((byte) => [...byte.toString(2).padStart(8, '0')].map(Number)),
  );
  let at = 0;
  const take = (length) => {
    let value = 0;
    for (let i = 0; i < length; i++) value = (value << 1) | stream[at++];
    return value;
  };
  // One byte segment, its length, its bytes; then a terminator, zeros to the byte and padding.
  assert.equal(take(4), 0b0100);
  const bytes = Uint8Array.from({ length: take(version <= 9 ? 8 : 16) }, () => take(8));
  assert.equal(take(Math.min(4, stream.length - at)), 0);
  assert.equal(take((8 - (at % 8)) % 8), 0);
  for (let pad = 0xec; at < stream.length; pad ^= 0xec ^ 0x11) assert.equal(take(8), pad);
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), version, level };
}

const words = (bytes) =>
  'Read a little. Reflect a little. Keep your curiosity growing. '
    .repeat(Math.ceil(bytes / 62))
    .slice(0, bytes);

test('a code reads back as its text, with error correction that checks out', () => {
  const cases = [
    ['nymphilia.com', 'M', 1],
    ['读一点，想一点。', 'M', 2],
    [words(50), 'Q', 5],
    ['https://nymphilia.com/blog/before_20th_birthday/#quote=' + words(55), 'M', 7],
    [words(110), 'H', 10],
    [words(2900), 'L', 40],
  ];
  for (const [text, level, version] of cases)
    assert.deepEqual(read(qrCode(text, level)), { text, version, level });
});

test('every mask is chosen for some text, and reads back', () => {
  const chosen = new Set();
  for (let i = 0; i < 60; i++) {
    const text = String(i * 7919);
    const code = qrCode(text);
    assert.deepEqual(read(code), { text, version: 1, level: 'H' });
    chosen.add(formatOf(code).mask);
  }
  assert.equal(chosen.size, 8);
});

test('a text takes the smallest version that holds it, at the strongest level that fits', () => {
  // The bytes each version holds at each level, from the standard.
  const capacity = {
    L: [
      17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792,
      858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303,
      2431, 2563, 2699, 2809, 2953,
    ],
    M: [
      14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
      711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911,
      1989, 2099, 2213, 2331,
    ],
    Q: [
      11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394, 442, 482,
      509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423,
      1499, 1579, 1663,
    ],
    H: [
      7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338, 382, 403,
      439, 461, 511, 535, 593, 625, 658, 698, 742, 790, 842, 898, 958, 983, 1051, 1093, 1139, 1219,
      1273,
    ],
  };
  for (const [level, holds] of Object.entries(capacity))
    holds.forEach((bytes, i) => {
      assert.equal(versionOf(qrCode('a'.repeat(bytes), level)), i + 1, `${bytes} bytes, ${level}`);
      if (i < 39) assert.equal(versionOf(qrCode('a'.repeat(bytes + 1), level)), i + 2);
    });
  // Text counts by its UTF-8 bytes: three for each of these characters.
  assert.equal(versionOf(qrCode('好'.repeat(4))), 1);
  assert.equal(versionOf(qrCode('好'.repeat(5))), 2);
  assert.throws(() => qrCode('a'.repeat(2332)), RangeError);
  assert.throws(() => qrCode('a'.repeat(2954), 'L'), RangeError);
  // Room to spare in the version goes to stronger error correction.
  assert.equal(formatOf(qrCode('Alicia')).level, 'H');
  assert.equal(formatOf(qrCode('nymphilia.com', 'L')).level, 'M');
  assert.equal(formatOf(qrCode('https://nymphilia.com/')).level, 'M');
});

test('the finder, timing and alignment patterns are where a reader looks for them', () => {
  for (const text of ['Alicia', words(110), words(2900)]) {
    const code = qrCode(text, 'L');
    const { size } = code;
    // A dark 3×3 centre, then light, dark and light rings, the last a separator.
    for (const [left, top] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ])
      for (let y = top - 1; y <= top + 7; y++)
        for (let x = left - 1; x <= left + 7; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const ring = Math.max(Math.abs(x - left - 3), Math.abs(y - top - 3));
          assert.equal(code.dark(x, y), ring <= 1 || ring === 3, `finder module ${x}, ${y}`);
        }
    for (let i = 8; i < size - 8; i++) {
      assert.equal(code.dark(i, 6), i % 2 === 0);
      assert.equal(code.dark(6, i), i % 2 === 0);
    }
    assert.ok(code.dark(8, size - 8));
    if (size > 21)
      for (let y = size - 9; y <= size - 5; y++)
        for (let x = size - 9; x <= size - 5; x++)
          assert.equal(
            code.dark(x, y),
            Math.max(Math.abs(x - size + 7), Math.abs(y - size + 7)) !== 1,
            `alignment module ${x}, ${y}`,
          );
    // Around the code is the light quiet zone.
    assert.equal(code.dark(-1, 0) || code.dark(0, -1) || code.dark(size, 0), false);
  }
});

test('the path draws each dark module once and no light one', () => {
  const code = qrCode('https://nymphilia.com/blog/moments/');
  const drawn = Array.from({ length: code.size }, () => new Array(code.size).fill(0));
  const path = qrPath(code);
  assert.match(path, /^(M\d+ \d+h\d+v1h-\d+z)+$/);
  for (const [, x, y, run, back] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    assert.equal(run, back);
    for (let i = 0; i < Number(run); i++) drawn[Number(y)][Number(x) + i]++;
  }
  for (let y = 0; y < code.size; y++)
    for (let x = 0; x < code.size; x++) assert.equal(drawn[y][x], Number(code.dark(x, y)));
});
