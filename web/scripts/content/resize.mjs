import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The boxes reader.css draws article photos in, in CSS pixels: the reading column is at
 * most 713px wide (at a 1000px window), and on windows up to 600px wide it is the window
 * less two 20px gutters. Galleries have three columns with 12px gaps, and a photo in its
 * own figure is at most 360px tall. Photos outside galleries have a 1px border.
 * tests/resize.test.mjs checks these against the stylesheets.
 */
export const photoLayout = {
  column: 720,
  phoneWindow: 600,
  phoneGutter: 20,
  galleryColumns: 3,
  galleryGap: 12,
  figureHeight: 360,
  border: 1,
};
/**
 * Copies cover phones up to 430px wide at three device pixels per CSS pixel and larger
 * screens at two, with a fifth to spare: browsers draw a photo sharpest when they shrink
 * it a little, but less than half. Screens that need more pick the photo itself.
 */
export const copyScreens = { phone: 430, phoneDensity: 3, density: 2, spare: 1.2 };
// A copy is made at most this share of the photo's width and height, and shown only
// when it is at most this share of the photo's bytes.
const copyLimit = 0.8;
// Bump when the encoder settings change, so cached copies are made again.
const copyVersion = 1;

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * Where each image in sanitized article HTML sits, in document order: in a gallery, in a
 * figure of its own at the top of the article, and whether a link wraps it.
 */
export function imagePlaces(html) {
  const places = [];
  const open = [];
  for (const [, closing, name, attributes] of html.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
  )) {
    const tag = name.toLowerCase();
    if (closing) {
      const at = open.findLastIndex((element) => element.tag === tag);
      if (at >= 0) open.length = at;
    } else if (tag === 'img') {
      places.push({
        gallery: open.some((element) => element.gallery),
        figure: open[0]?.tag === 'figure',
        linked: open.some((element) => element.tag === 'a'),
      });
    } else if (!voidElements.has(tag) && !/\/\s*$/.test(attributes)) {
      const gallery = tag === 'div' && /\sclass="(?:[^"]*\s)?article-gallery[\s"]/.test(attributes);
      open.push({ tag, gallery });
    }
  }
  return places;
}

/** How wide a photo is drawn, in CSS pixels, in a reading column of the given width. */
export function drawnWidth({ width, height }, place, column = photoLayout.column) {
  const { galleryColumns, galleryGap, figureHeight, border } = photoLayout;
  if (place.gallery) {
    // Gallery photos fit a square cell, larger or smaller than their own size.
    const cell = (column - galleryGap * (galleryColumns - 1)) / galleryColumns;
    return cell * Math.min(1, width / height);
  }
  const fit = Math.min(width, column - 2 * border);
  return place.figure ? Math.min(fit, ((figureHeight - 2 * border) * width) / height) : fit;
}

const divisor = (a, b) => (b ? divisor(b, a % b) : a);

/**
 * The size of a copy that is sharp wherever the photo is shown, or undefined when the
 * photo is not much larger than that. Outside galleries a photo's height follows the
 * shape of its file, so the copy keeps exactly the photo's shape and nothing below it
 * moves; gallery cells are square whatever the shape.
 */
export function copySize(size, place) {
  const { width, height } = size;
  const { phone, phoneDensity, density, spare } = copyScreens;
  const phoneColumn = phone - 2 * photoLayout.phoneGutter;
  const needed =
    spare *
    Math.max(
      phoneDensity * drawnWidth(size, place, phoneColumn),
      density * drawnWidth(size, place),
    );
  if (place.gallery) {
    if (needed > width * copyLimit) return undefined;
    const scale = needed / width;
    return {
      width: Math.max(1, Math.round(needed)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  // The smallest whole-pixel size of the same shape that is at least as wide as needed.
  const common = divisor(width, height);
  const steps = Math.ceil((needed * common) / width - 1e-9);
  if ((steps * width) / common > width * copyLimit) return undefined;
  return { width: (steps * width) / common, height: (steps * height) / common };
}

/**
 * The sizes attribute for a photo with a copy: how wide it is drawn on phones, where the
 * column follows the window, and elsewhere at most. Browsers pick the copy or the photo
 * itself by it.
 */
export function copySizes(size, place) {
  const { phoneWindow, phoneGutter, galleryColumns, galleryGap, border } = photoLayout;
  const widest = Math.ceil(drawnWidth(size, place) - 1e-9);
  if (place.gallery) {
    const share = Math.min(1, size.width / size.height) / galleryColumns;
    const less = 2 * phoneGutter + galleryGap * (galleryColumns - 1);
    const phone = share === 1 / galleryColumns ? `/ ${galleryColumns}` : `* ${+share.toFixed(4)}`;
    return `(max-width: ${phoneWindow}px) calc((100vw - ${less}px) ${phone}), ${widest}px`;
  }
  // Windows narrower than this draw the photo at the column width.
  const less = 2 * (phoneGutter + border);
  return `(max-width: ${Math.min(phoneWindow, widest + less)}px) calc(100vw - ${less}px), ${widest}px`;
}

/** JPEG and still PNG photos get copies; other formats keep loading as they are. */
export function copyFormat(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  const png = buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47;
  if (!png) return undefined;
  // An animation control chunk before the image data makes an animated PNG.
  for (let at = 8; at + 8 <= buffer.length; at += 12 + buffer.readUInt32BE(at)) {
    const type = buffer.toString('latin1', at + 4, at + 8);
    if (type === 'acTL') return undefined;
    if (type === 'IDAT') return 'png';
  }
  return undefined;
}

const sources = new Map();

/**
 * The copy of an article photo to show in its place, or undefined when the photo should
 * load as it is. Copies are named by the photo's contents and size, so a replaced photo
 * gets a new copy and an unchanged one is made only once.
 */
export function photoCopy(file, size, place, directory) {
  const target = copySize(size, place);
  if (!target) return undefined;
  const stat = fs.statSync(file);
  const version = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  let source = sources.get(file);
  if (source?.version !== version) {
    const buffer = fs.readFileSync(file);
    const format = copyFormat(buffer);
    const digest = format && crypto.createHash('sha256').update(buffer).digest('hex');
    source = { version, format, digest };
    sources.set(file, source);
  }
  if (!source.format) return undefined;
  const key = crypto
    .createHash('sha256')
    .update(`${copyVersion}:${source.digest}:${target.width}x${target.height}`)
    .digest('hex')
    .slice(0, 16);
  return {
    source: file,
    file: path.join(directory, key, path.basename(file)),
    format: source.format,
    ...target,
  };
}

/** Shows the photo itself wherever the copy named by one of these markers is not shown. */
export function withoutCopies(html, markers) {
  if (!markers.size) return html;
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (!markers.has(/\ssrc="([^"]*)"/.exec(tag)?.[1])) return tag;
    const photo = /\ssrcset="[^"]*,\s*(\S+)\s+\d+w"/.exec(tag)[1];
    return tag
      .replace(/\s(?:srcset|sizes|data-full-src)="[^"]*"/g, '')
      .replace(/\ssrc="[^"]*"/, () => ` src="${photo}"`);
  });
}

/**
 * Writes a copy made by photoCopy unless it exists, and tells whether to show it: false
 * when the photo cannot be read as a plain colour photo or the copy saves too little.
 * The photo's colour profile stays, so wide-colour photos keep their colours.
 */
export async function writePhotoCopy(copy) {
  if (!fs.existsSync(copy.file)) {
    const { default: sharp } = await import('sharp');
    const image = sharp(copy.source);
    const { space, depth, chromaSubsampling } = await image.metadata();
    if (space !== 'srgb' || depth !== 'uchar') return false;
    image
      .autoOrient()
      .resize(copy.width, copy.height, { fit: 'fill', kernel: 'lanczos3', fastShrinkOnLoad: false })
      .keepIccProfile();
    if (copy.format === 'jpeg')
      image.jpeg({
        quality: 90,
        mozjpeg: true,
        chromaSubsampling: chromaSubsampling === '4:4:4' ? '4:4:4' : '4:2:0',
      });
    else image.png({ compressionLevel: 9, adaptiveFiltering: true });
    const data = await image.toBuffer();
    fs.mkdirSync(path.dirname(copy.file), { recursive: true });
    // Written whole, then renamed, so an interrupted build never leaves half a copy.
    const partial = `${copy.file}.${process.pid}.partial`;
    fs.writeFileSync(partial, data);
    fs.renameSync(partial, copy.file);
  }
  return fs.statSync(copy.file).size <= fs.statSync(copy.source).size * copyLimit;
}
