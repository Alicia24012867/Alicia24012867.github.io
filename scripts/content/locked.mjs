import crypto from 'node:crypto';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { lockedFilePrefix } from '../../src/config/locked.mjs';

/**
 * Locked documents ship sealed with a key made from one password: their text and files are
 * unreadable without it, wherever the built site is copied. src/content/locked/crypto.ts
 * opens them in the browser with the same derivation.
 *
 * A sealed file holds the format (1 byte), the PBKDF2 rounds (4 bytes, big-endian), the salt
 * length (1 byte) and salt, then the AES-GCM nonce (12 bytes), the ciphertext and its tag.
 */
export const LOCK_FORMAT = 1;
export const LOCK_ROUNDS = 600_000;
// One salt for every build, so the key a reader's browser remembers keeps opening new posts.
export const LOCK_SALT = 'nymphilia.com/locked/v1';
// The sealed files are public, so a short password could be guessed offline.
export const LOCK_MIN_PASSWORD = 12;

/** Spaces around a password, or composed and decomposed accents, never make another one. */
export const normalizePassword = (password) => password.trim().normalize('NFC');

export function createLock(password, { rounds = LOCK_ROUNDS, salt = LOCK_SALT } = {}) {
  const saltBytes = Buffer.from(salt, 'utf8');
  const master = crypto.pbkdf2Sync(normalizePassword(password), saltBytes, rounds, 32, 'sha256');
  const derive = (info) =>
    Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  const key = derive('locked/aes-gcm');
  const nonceKey = derive('locked/nonce');
  const header = Buffer.alloc(6 + saltBytes.length);
  header[0] = LOCK_FORMAT;
  header.writeUInt32BE(rounds, 1);
  header[5] = saltBytes.length;
  saltBytes.copy(header, 6);
  return {
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
