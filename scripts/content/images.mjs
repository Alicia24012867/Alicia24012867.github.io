import fs from 'node:fs';

const dimensions = (width, height) =>
  Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;

// The only EXIF tags that change the size a browser shows an image at.
const exifNames = new Map([
  [0x0112, 'orientation'],
  [0x0128, 'unit'],
  [0x011a, 'xResolution'],
  [0x011b, 'yResolution'],
  [0x8769, 'exifPointer'],
  [0xa002, 'xPixels'],
  [0xa003, 'yPixels'],
]);

function exifTags(data) {
  const tiff = data.toString('latin1', 0, 6) === 'Exif\0\0' ? data.subarray(6) : data;
  const order = tiff.toString('latin1', 0, 2);
  const tags = {};
  if (order !== 'II' && order !== 'MM') return tags;
  const u16 = (at) => (order === 'II' ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at) => (order === 'II' ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const read = (directory) => {
    for (let entry = directory + 2, end = entry + u16(directory) * 12; entry < end; entry += 12) {
      const name = exifNames.get(u16(entry));
      if (!name) continue;
      const type = u16(entry + 2);
      // Shorts and longs sit in the entry itself; a rational points to two longs. Browsers
      // ignore a tag stored as any other type.
      if (type === 3) tags[name] = u16(entry + 8);
      else if (type === 4 || type === 13) tags[name] = u32(entry + 8);
      else if (type === 5) tags[name] = u32(u32(entry + 8)) / u32(u32(entry + 8) + 4);
    }
  };
  read(u32(4));
  if (tags.exifPointer) read(tags.exifPointer);
  return tags;
}

/**
 * EXIF can turn a photo on its side or ask for a smaller display size. Every browser
 * turns JPEG photos; for other formats, and for display sizes, browsers differ.
 */
function displaySize(width, height, tags, everyBrowserTurns) {
  if (!tags) return dimensions(width, height);
  const { orientation, unit = 2, xResolution, yResolution, xPixels, yPixels } = tags;
  // HTML's density-corrected size, e.g. a 144 dpi file that declares half its pixel size.
  if (
    unit === 2 &&
    (xPixels !== width || yPixels !== height) &&
    Math.round((width * 72) / xResolution) === xPixels &&
    Math.round((height * 72) / yResolution) === yPixels
  )
    return undefined;
  if (orientation >= 5 && orientation <= 8)
    return everyBrowserTurns ? dimensions(height, width) : undefined;
  return dimensions(width, height);
}

function png(buffer) {
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return undefined;
  let tags;
  for (let at = 8; !tags && at + 8 <= buffer.length; at += 12 + buffer.readUInt32BE(at)) {
    const type = buffer.toString('latin1', at + 4, at + 8);
    if (type === 'IEND') break;
    if (type === 'eXIf') tags = exifTags(buffer.subarray(at + 8, at + 8 + buffer.readUInt32BE(at)));
  }
  return displaySize(buffer.readUInt32BE(16), buffer.readUInt32BE(20), tags, false);
}

function gif(buffer) {
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  // Skip the global colour table and any extension blocks to the first frame.
  let at = 13 + (buffer[10] & 0x80 ? 3 << ((buffer[10] & 7) + 1) : 0);
  while (buffer[at] === 0x21) {
    at += 2;
    while (buffer[at]) at += buffer[at] + 1;
    at++;
  }
  if (buffer[at] !== 0x2c) return undefined;
  const [left, top, frameWidth, frameHeight] = [1, 3, 5, 7].map((offset) =>
    buffer.readUInt16LE(at + offset),
  );
  // Browsers grow the picture around a first frame that does not fit the declared
  // screen, and some size GIF87a files by their first frame alone.
  const fits =
    buffer[4] === 0x37
      ? left === 0 && top === 0 && frameWidth === width && frameHeight === height
      : frameWidth > 0 &&
        frameHeight > 0 &&
        left + frameWidth <= width &&
        top + frameHeight <= height;
  return fits ? dimensions(width, height) : undefined;
}

function jpeg(buffer) {
  let frame;
  let tags;
  // Decoders read every header up to the image data, skipping stray and fill bytes.
  for (let at = 2; at + 4 <= buffer.length; ) {
    const marker = buffer[at + 1];
    if (buffer[at] !== 0xff || marker === 0xff) at++;
    else if (marker === 0xda || marker === 0xd9) break;
    else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) at += 2;
    else {
      const end = at + 2 + buffer.readUInt16BE(at + 2);
      // SOF0–SOF15 carry the frame size; C4, C8 and CC are DHT, JPG and DAC segments.
      if (!frame && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        frame = [buffer.readUInt16BE(at + 7), buffer.readUInt16BE(at + 5)];
      else if (
        !tags &&
        marker === 0xe1 &&
        buffer.toString('latin1', at + 4, at + 10) === 'Exif\0\0'
      )
        tags = exifTags(buffer.subarray(at + 4, end));
      at = end;
    }
  }
  return frame && displaySize(...frame, tags, true);
}

function webp(buffer) {
  const format = buffer.toString('latin1', 12, 16);
  if (format === 'VP8 ')
    return buffer.readUIntBE(23, 3) === 0x9d012a
      ? dimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff)
      : undefined;
  if (format === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return buffer[20] === 0x2f
      ? dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
      : undefined;
  }
  if (format !== 'VP8X') return undefined;
  let tags;
  // The EXIF chunk, when the header announces one, follows the image data.
  for (let at = 12; buffer[20] & 0x08 && !tags && at + 8 <= buffer.length; ) {
    const length = buffer.readUInt32LE(at + 4);
    if (buffer.toString('latin1', at, at + 4) === 'EXIF')
      tags = exifTags(buffer.subarray(at + 8, at + 8 + length));
    at += 8 + length + (length & 1);
  }
  return displaySize(buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1, tags, false);
}

/** ISO base media boxes between two offsets, as AVIF stores them. */
function* boxes(buffer, start = 0, end = buffer.length) {
  for (let at = start; at + 8 <= end; ) {
    let length = buffer.readUInt32BE(at);
    let header = 8;
    if (length === 1) [length, header] = [Number(buffer.readBigUInt64BE(at + 8)), 16];
    else if (length === 0) length = end - at;
    if (length < header || at + length > end) return;
    yield { type: buffer.toString('latin1', at + 4, at + 8), start: at + header, end: at + length };
    at += length;
  }
}

function avif(buffer) {
  const find = (type, box) => [...boxes(buffer, box?.start, box?.end)].find((b) => b.type === type);
  const ftyp = find('ftyp');
  if (!ftyp) return undefined;
  const brands = [];
  // The major brand, then the compatible brands after the minor version.
  for (let at = ftyp.start; at + 4 <= ftyp.end; at += 4)
    if (at !== ftyp.start + 4) brands.push(buffer.toString('latin1', at, at + 4));
  if (!brands.includes('avif') && !brands.includes('avis')) return undefined;
  const meta = find('meta');
  const contents = meta && { start: meta.start + 4, end: meta.end };
  const pitm = meta && find('pitm', contents);
  const iprp = meta && find('iprp', contents);
  const ipco = iprp && find('ipco', iprp);
  if (!pitm || !ipco) return undefined;
  const primary = buffer[pitm.start]
    ? buffer.readUInt32BE(pitm.start + 4)
    : buffer.readUInt16BE(pitm.start + 4);
  const properties = [...boxes(buffer, ipco.start, ipco.end)];
  let width;
  let height;
  let turned = false;
  // Items list their properties by number; only the primary image's apply.
  for (const ipma of boxes(buffer, iprp.start, iprp.end)) {
    if (ipma.type !== 'ipma') continue;
    const wideItems = buffer[ipma.start] > 0;
    const wideIndexes = buffer[ipma.start + 3] & 1;
    let at = ipma.start + 8;
    for (let entries = buffer.readUInt32BE(ipma.start + 4); entries > 0; entries--) {
      const item = wideItems ? buffer.readUInt32BE(at) : buffer.readUInt16BE(at);
      at += wideItems ? 4 : 2;
      for (let count = buffer[at++]; count > 0; count--, at += wideIndexes ? 2 : 1) {
        const index = wideIndexes ? buffer.readUInt16BE(at) & 0x7fff : buffer[at] & 0x7f;
        const property = item === primary ? properties[index - 1] : undefined;
        if (property?.type === 'ispe') {
          width = buffer.readUInt32BE(property.start + 4);
          height = buffer.readUInt32BE(property.start + 8);
        }
        // A quarter turn either way swaps the sides; crops are not shown alike everywhere.
        else if (property?.type === 'irot') turned = (buffer[property.start] & 1) === 1;
        else if (property?.type === 'clap') return undefined;
      }
    }
  }
  return turned ? dimensions(height, width) : dimensions(width, height);
}

// CSS absolute lengths in pixels; percentages and font-relative lengths have no fixed size.
const svgUnits = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 4 / 3, pc: 16 };

function svg(text) {
  const root = text.replace(/<!--[\s\S]*?-->/g, '').match(/<svg\b((?:[^>"']|"[^"]*"|'[^']*')*)>/);
  // A style on the root element can override its width and height attributes.
  if (!root || /\sstyle\s*=\s*(?:"[^"]*|'[^']*)\b(?:width|height)\b/i.test(root[1]))
    return undefined;
  const [width, height] = ['width', 'height'].map((name) => {
    const value = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(root[1]);
    const length = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(px|in|cm|mm|q|pt|pc)?\s*$/i.exec(
      value?.[1] ?? value?.[2] ?? '',
    );
    return length && Math.round(Number(length[1]) * svgUnits[length[2]?.toLowerCase() ?? 'px']);
  });
  return dimensions(width, height);
}

/**
 * The width and height a browser shows an image at, read from the file header without
 * an image library, so an article can keep the image's space before it loads. Unknown
 * formats, damaged headers and sizes browsers disagree on give undefined, and such an
 * image loads as it always has.
 */
export function imageSize(buffer, filename = '') {
  try {
    // Browsers only draw SVG served as SVG, which static hosts decide by the extension.
    if (/\.svg$/i.test(filename)) return svg(buffer.toString('utf8'));
    if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a)
      return png(buffer);
    if (/^GIF8[79]a$/.test(buffer.toString('latin1', 0, 6))) return gif(buffer);
    if (buffer.readUInt16BE(0) === 0xffd8) return jpeg(buffer);
    if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP')
      return webp(buffer);
    if (buffer.toString('latin1', 4, 8) === 'ftyp') return avif(buffer);
  } catch (error) {
    // A truncated header reads past the end of the file.
    if (!(error instanceof RangeError)) throw error;
  }
  return undefined;
}

const known = new Map();

/** Each version of an image file is read once; rebuilding skips images that did not change. */
export function readImageSize(file, stat = fs.statSync(file, { throwIfNoEntry: false })) {
  if (!stat?.isFile()) return undefined;
  const version = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  let entry = known.get(file);
  if (entry?.version !== version) {
    entry = { version, size: imageSize(fs.readFileSync(file), file) };
    known.set(file, entry);
  }
  return entry.size;
}
