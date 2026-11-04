import { lockedRingDirectory } from '../../config/locked.mjs';

/**
 * Opens files sealed by scripts/content/locked.mjs. A level's password makes a master key by
 * PBKDF2, HKDF turns it into an AES-GCM key, and that key opens the level's sealed files. Its
 * key ring holds the master keys of the levels below it. Master keys are kept on this device
 * once they open a document, so other locked documents they open do not ask again.
 */

// A sealed file: format, PBKDF2 rounds (big-endian), salt length and salt, nonce, ciphertext.
const sealedFormat = 1;
const nonceLength = 12;
const tagLength = 16;
const keptKey = 'alicia-locked-key';
// Beyond this many kept keys the oldest go, as those of changed passwords pile up.
const keptLimit = 8;
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
  /** The name of this key's ring. */
  ring: string;
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

const hkdf = (info: string) => ({
  name: 'HKDF',
  hash: 'SHA-256',
  salt: new Uint8Array(),
  info: encoder.encode(info),
});

async function lockKey(
  master: Uint8Array<ArrayBuffer>,
  rounds: number,
  salt: string,
): Promise<LockKey> {
  const material = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveKey',
    'deriveBits',
  ]);
  const [key, ring] = await Promise.all([
    crypto.subtle.deriveKey(
      hkdf('locked/aes-gcm'),
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    ),
    crypto.subtle.deriveBits(hkdf('locked/keyring'), material, 64),
  ]);
  const hex = [...new Uint8Array(ring)].map((byte) => byte.toString(16).padStart(2, '0'));
  return { rounds, salt, master, key, ring: hex.join('') };
}

/** The keys from master keys kept as base64; any that is not one is left out. */
async function keysOf(masters: string[], rounds: number, salt: string) {
  const keys = await Promise.all(
    masters.map(async (master) => {
      try {
        return await lockKey(fromBase64(master), rounds, salt);
      } catch {
        return undefined;
      }
    }),
  );
  return keys.filter((key): key is LockKey => !!key);
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

/** A sealed document and the key that opened it, if one of `keys` does. */
export async function openWithAny<T>(keys: LockKey[], sealed: Sealed) {
  for (const key of keys) {
    const document = await openDocument<T>(key, sealed).catch(() => undefined);
    if (document) return { key, document };
  }
  return undefined;
}

/**
 * The keys in a key's ring, those of every level below its own, from the site at `base`. A key
 * without a ring, as a wrong password makes, has none: undefined. Fails when the ring cannot be
 * fetched, so that a right password is never taken for a wrong one.
 */
export async function ringKeys(key: LockKey, base: string): Promise<LockKey[] | undefined> {
  // A ring changes when a lower level's password does, so the browser checks its copy first.
  const url = `${base}${lockedRingDirectory}/${key.ring}.bin`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  const sealed = readSealed(new Uint8Array(await response.arrayBuffer()));
  const ring =
    sealed && (await openDocument<{ masters?: unknown }>(key, sealed).catch(() => undefined));
  if (!ring || !Array.isArray(ring.masters)) return undefined;
  const masters = ring.masters.filter((master): master is string => typeof master === 'string');
  return keysOf(masters, key.rounds, key.salt);
}

type Kept = { rounds: number; salt: string; masters: string[] };

/** The master keys kept on this device for these rounds and salt, newest first. */
function readKept({ rounds, salt }: { rounds: number; salt: string }): string[] {
  let kept: { rounds?: unknown; salt?: unknown; master?: unknown; masters?: unknown } | null;
  try {
    kept = JSON.parse(localStorage.getItem(keptKey) ?? 'null');
  } catch {
    return [];
  }
  if (!kept || kept.rounds !== rounds || kept.salt !== salt) return [];
  // A device that unlocked before there were levels kept one key.
  const masters = Array.isArray(kept.masters) ? kept.masters : [kept.master];
  return masters.filter((master): master is string => typeof master === 'string');
}

/** The keys kept on this device for files sealed like `sealed`, newest first. */
export function keptLockKeys({ rounds, salt }: Pick<Sealed, 'rounds' | 'salt'>) {
  const kept = toBase64(salt);
  return keysOf(readKept({ rounds, salt: kept }), rounds, kept);
}

/** Keeps keys that opened a document or came with one, for the next locked document here. */
export function keepLockKeys(keys: LockKey[]) {
  if (!keys.length) return;
  const { rounds, salt } = keys[0];
  const masters = [
    ...new Set([...keys.map((key) => toBase64(key.master)), ...readKept({ rounds, salt })]),
  ];
  const kept: Kept = { rounds, salt, masters: masters.slice(0, keptLimit) };
  try {
    localStorage.setItem(keptKey, JSON.stringify(kept));
  } catch {
    // Without storage, the next visit asks for the password again.
  }
}
