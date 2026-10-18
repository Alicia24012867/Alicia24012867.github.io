/**
 * Opens files sealed by scripts/content/locked.mjs. The password makes a master key by PBKDF2,
 * HKDF turns it into an AES-GCM key, and that key opens every sealed file. The master key is
 * kept on this device once it opens a document, so other locked documents open without asking.
 */

// A sealed file: format, PBKDF2 rounds (big-endian), salt length and salt, nonce, ciphertext.
const sealedFormat = 1;
const nonceLength = 12;
const tagLength = 16;
const keptKey = 'alicia-locked-key';
const encoder = new TextEncoder();

export interface Sealed {
  rounds: number;
  salt: Uint8Array<ArrayBuffer>;
  nonce: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
}

export interface LockKey {
  rounds: number;
  /** The salt as base64, so a kept key is used only for files sealed with it. */
  salt: string;
  master: Uint8Array<ArrayBuffer>;
  key: CryptoKey;
}

/** The parts of a sealed file, or undefined when the bytes are not one. */
export function readSealed(bytes: Uint8Array<ArrayBuffer>): Sealed | undefined {
  if (bytes.length < 6 || bytes[0] !== sealedFormat) return undefined;
  const rounds = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1);
  const nonceAt = 6 + bytes[5];
  if (!rounds || bytes.length < nonceAt + nonceLength + tagLength) return undefined;
  return {
    rounds,
    salt: bytes.subarray(6, nonceAt),
    nonce: bytes.subarray(nonceAt, nonceAt + nonceLength),
    data: bytes.subarray(nonceAt + nonceLength),
  };
}

/** The sealed file at an address. */
export async function fetchSealed(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  const sealed = readSealed(new Uint8Array(await response.arrayBuffer()));
  if (!sealed) throw new Error(`Not a sealed file: ${url}`);
  return sealed;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

async function lockKey(master: Uint8Array<ArrayBuffer>, rounds: number, salt: string) {
  const material = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(),
      info: encoder.encode('locked/aes-gcm'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  return { rounds, salt, master, key };
}

/** The key a password makes for files sealed like `sealed`; spaces around it do not count. */
export async function keyFromPassword(
  password: string,
  { rounds, salt }: Pick<Sealed, 'rounds' | 'salt'>,
): Promise<LockKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.trim().normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    material,
    256,
  );
  return lockKey(new Uint8Array(bits), rounds, toBase64(salt));
}

/** The contents of a sealed file; fails when the key is not the one it was sealed with. */
export async function openSealed(key: LockKey, sealed: Sealed) {
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.nonce },
    key.key,
    sealed.data,
  );
  return new Uint8Array(opened);
}

/** A sealed document: compressed JSON. */
export async function openDocument<T>(key: LockKey, sealed: Sealed): Promise<T> {
  const zipped = await openSealed(key, sealed);
  const text = new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(text).text()) as T;
}

/** The key kept on this device, if it was made for files sealed like `sealed`. */
export async function keptLockKey({ rounds, salt }: Pick<Sealed, 'rounds' | 'salt'>) {
  let kept: { rounds?: unknown; salt?: unknown; master?: unknown } | null;
  try {
    kept = JSON.parse(localStorage.getItem(keptKey) ?? 'null');
  } catch {
    return undefined;
  }
  if (!kept || kept.rounds !== rounds || kept.salt !== toBase64(salt)) return undefined;
  if (typeof kept.master !== 'string') return undefined;
  try {
    return await lockKey(fromBase64(kept.master), rounds, kept.salt);
  } catch {
    return undefined;
  }
}

/** Keeps a key that opened a document, for the next locked document on this device. */
export function keepLockKey({ rounds, salt, master }: LockKey) {
  try {
    localStorage.setItem(keptKey, JSON.stringify({ rounds, salt, master: toBase64(master) }));
  } catch {
    // Without storage, the next visit asks for the password again.
  }
}
