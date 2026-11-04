import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'yaml';
import { lockedFilePrefix, lockedRingDirectory } from '../../src/config/locked.mjs';

/**
 * Locked documents ship sealed with a key made from their level's password: their text and
 * files are unreadable without it, wherever the built site is copied. src/content/locked/crypto.ts
 * opens them in the browser with the same derivation.
 *
 * A sealed file holds the format (1 byte), the PBKDF2 rounds (4 bytes, big-endian), the salt
 * length (1 byte) and salt, then the AES-GCM nonce (12 bytes), the ciphertext and its tag.
 *
 * Each level also has a key ring, sealed with its key, that holds the keys of every level below
 * it: a higher password opens lower documents through it, and a lower one is told apart from a
 * wrong one because it opens a ring.
 */
export const LOCK_FORMAT = 1;
export const LOCK_ROUNDS = 600_000;
// One salt for every build, so the key a reader's browser remembers keeps opening new posts.
export const LOCK_SALT = 'nymphilia.com/locked/v1';
// The sealed files are public, so a short password could be guessed offline.
export const LOCK_MIN_PASSWORD = 12;

// Each level's password is a secret of its own in the deploy workflow, which names them all.
export const LOCK_LEVELS = 5;

/** Spaces around a password, or composed and decomposed accents, never make another one. */
export const normalizePassword = (password) => password.trim().normalize('NFC');

/** The secret that holds a level's password: LOCKED_PASSWORD, then LOCKED_PASSWORD_2 and up. */
export const passwordName = (level) => (level ? `LOCKED_PASSWORD_${level + 1}` : 'LOCKED_PASSWORD');

/** Every level's password from the environment, lowest level first. */
export const passwordsFromEnv = (env = process.env) =>
  Array.from({ length: LOCK_LEVELS }, (_, level) => env[passwordName(level)]);

/**
 * The names of the levels in `file`, lowest first, as `levels: [friends, family]`. Without the
 * file there is one level, and no document names it.
 */
export function readLevels(file, label = file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  let levels;
  try {
    levels = parse(source, { uniqueKeys: true })?.levels;
  } catch (error) {
    // Build logs are public, so a parse error names its line and never quotes the file.
    const line = error.linePos?.[0]?.line;
    throw new Error(`${label}: 格式有误${line ? `，请检查第 ${line} 行` : ''}`);
  }
  const names = Array.isArray(levels)
    ? levels.map((name) => (typeof name === 'string' ? name.trim() : ''))
    : [];
  if (!names.length || names.some((name) => !name))
    throw new Error(`${label}: 请从低到高列出等级名，例如 levels: [friends, family]`);
  // Build logs are public, so errors never name a level.
  if (new Set(names).size < names.length) throw new Error(`${label}: 等级名不能重复`);
  if (names.length > LOCK_LEVELS) throw new Error(`${label}: 最多 ${LOCK_LEVELS} 个等级`);
  return names;
}

export function createLock(password, { rounds = LOCK_ROUNDS, salt = LOCK_SALT } = {}) {
  const saltBytes = Buffer.from(salt, 'utf8');
  const master = crypto.pbkdf2Sync(normalizePassword(password), saltBytes, rounds, 32, 'sha256');
  const derive = (info, length = 32) =>
    Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), info, length));
  const key = derive('locked/aes-gcm');
  const nonceKey = derive('locked/nonce');
  const header = Buffer.alloc(6 + saltBytes.length);
  header[0] = LOCK_FORMAT;
  header.writeUInt32BE(rounds, 1);
  header[5] = saltBytes.length;
  saltBytes.copy(header, 6);
  return {
    /** What higher levels' key rings hold, so their passwords open this level's documents. */
    master,
    /** The name of this key's ring, which only the key can find. */
    ring: derive('locked/keyring', 8).toString('hex'),
    /**
     * The nonce comes from the sealed bytes themselves, so an unchanged post or photo seals to
     * the same file in every build and stays cached; different bytes never share a nonce.
     */
    seal(data) {
      const nonce = crypto.createHmac('sha256', nonceKey).update(data).digest().subarray(0, 12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      return Buffer.concat([
        header,
        nonce,
        cipher.update(data),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
    },
  };
}

/** A document's reading payload, compressed before sealing because sealed bytes never shrink. */
export const sealDocument = (lock, payload) =>
  lock.seal(gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));

/** A level's key ring: the keys of `lower` levels, sealed with its own, at its built path. */
export const sealRing = (lock, lower) => ({
  fileName: path.posix.join(lockedRingDirectory, `${lock.ring}.bin`),
  source: sealDocument(lock, { masters: lower.map((each) => each.master.toString('base64')) }),
});

/**
 * The built file name of sealed bytes: named by their contents, like every built asset. A
 * sealed file keeps a plain extension, so a link to a photo still reads as one.
 */
export function lockedFileName(assetsDir, sealed, extension = '.bin') {
  const digest = crypto.createHash('sha256').update(sealed).digest('hex').slice(0, 16);
  const kept = /^\.[a-z0-9]{1,10}$/.test(extension.toLowerCase())
    ? extension.toLowerCase()
    : '.bin';
  return path.posix.join(assetsDir, `${lockedFilePrefix}${digest}${kept}`);
}

/**
 * A sealed photo cannot load as it is: each waits in its place, drawn at its size, until the
 * reader opens it (src/content/locked/LockedArticle.tsx). A browser would fetch a copy named
 * in srcset by itself, so copies go; the viewer still opens the photo itself.
 */
export function veilImages(html, sealedUrls) {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const src = /\ssrc="([^"]*)"/.exec(tag)?.[1];
    if (!src || !sealedUrls.has(src)) return tag;
    const width = /\swidth="(\d+)"/.exec(tag)?.[1];
    const height = /\sheight="(\d+)"/.exec(tag)?.[1];
    const [w, h] = width && height ? [width, height] : [1, 1];
    const shape = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"/>`,
    );
    return tag
      .replace(/\s(?:srcset|sizes)="[^"]*"/g, '')
      .replace(
        /\ssrc="[^"]*"/,
        () => ` src="data:image/svg+xml,${shape}" data-locked-src="${src}"`,
      );
  });
}
