import crypto from 'node:crypto';
import type { Auth } from './auth.ts';
import { now } from './db.ts';
import { clearCookie, readCookies, setCookie, type Req, type Res } from './http.ts';
import { activePerson, type Person } from './people.ts';
import { endBrowserSession, endDeviceSessions } from './sessions.ts';

/**
 * A browser someone signed in on, by invite link or passkey. It stays signed in for a year, so
 * applications sign its person in without asking, as long as the device and the person last.
 */
export type Device = {
  id: string;
  personId: string;
  method: string;
  label: string;
  createdAt: number;
  seenAt: number;
  expiresAt: number;
  /** When a passkey last signed in here; the admin pages ask for one every 12 hours. */
  passkeyAt: number | null;
};

type DeviceRow = {
  id: string;
  person_id: string;
  secret_hash: Uint8Array;
  method: string;
  label: string;
  created_at: number;
  seen_at: number;
  expires_at: number;
  passkey_at: number | null;
};

export type SignedIn = { device: Device; person: Person };

const year = 365 * 86400;

const toDevice = (row: DeviceRow): Device => ({
  id: row.id,
  personId: row.person_id,
  method: row.method,
  label: row.label,
  createdAt: row.created_at,
  seenAt: row.seen_at,
  expiresAt: row.expires_at,
  passkeyAt: row.passkey_at,
});

const cookieName = (auth: Pick<Auth, 'config'>) =>
  auth.config.secure ? '__Host-device' : 'device';

const hash = (secret: string) => crypto.createHash('sha256').update(secret).digest();

/** The device row this browser's cookie names, if the cookie is genuine and current. */
function cookieDevice(auth: Pick<Auth, 'config' | 'db'>, req: Req): DeviceRow | undefined {
  const [id, secret] = (readCookies(req).get(cookieName(auth)) ?? '').split('.');
  if (!id || !secret) return undefined;
  const row = auth.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as
    | DeviceRow
    | undefined;
  if (!row || row.expires_at <= now()) return undefined;
  return crypto.timingSafeEqual(row.secret_hash, hash(secret)) ? row : undefined;
}

/** Who this browser is signed in as, if anyone. */
export function currentDevice(auth: Pick<Auth, 'config' | 'db'>, req: Req): SignedIn | undefined {
  const row = cookieDevice(auth, req);
  const person = row && activePerson(auth.db, row.person_id);
  if (!row || !person) return undefined;
  if (now() - row.seen_at > 3600) {
    row.seen_at = now();
    auth.db.prepare('UPDATE devices SET seen_at = ? WHERE id = ?').run(row.seen_at, row.id);
  }
  return { device: toDevice(row), person };
}

/** Signs this browser in as `person` for a year, in place of whoever was signed in here. */
export async function signIn(
  auth: Auth,
  req: Req,
  res: Res,
  person: Person,
  method: 'invite' | 'passkey' | 'setup',
): Promise<Device> {
  const time = now();
  const passkeyAt = method === 'invite' ? null : time;
  const previous = cookieDevice(auth, req);
  if (previous?.person_id === person.id) {
    // The same person again, with a passkey: the device starts a new year.
    if (passkeyAt !== null) {
      auth.db
        .prepare('UPDATE devices SET passkey_at = ?, expires_at = ?, seen_at = ? WHERE id = ?')
        .run(passkeyAt, time + year, time, previous.id);
    }
    return toDevice(
      auth.db.prepare('SELECT * FROM devices WHERE id = ?').get(previous.id) as DeviceRow,
    );
  }
  // Someone else was signed in here: the provider forgets them, and so does this browser.
  await endBrowserSession(auth, req, res);
  if (previous) auth.db.prepare('DELETE FROM devices WHERE id = ?').run(previous.id);

  const id = crypto.randomBytes(12).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  auth.db
    .prepare(
      `INSERT INTO devices (id, person_id, secret_hash, method, label, created_at, seen_at, expires_at, passkey_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      person.id,
      hash(secret),
      method,
      deviceLabel(req.headers['user-agent']),
      time,
      time,
      time + year,
      passkeyAt,
    );
  setCookie(res, cookieName(auth), `${id}.${secret}`, { maxAge: year, secure: auth.config.secure });
  return toDevice(auth.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow);
}

/** Signs this browser out, here and from the applications it signed in to. */
export async function signOut(auth: Auth, req: Req, res: Res) {
  const row = cookieDevice(auth, req);
  if (row) await removeDevice(auth, row.id);
  await endBrowserSession(auth, req, res);
  clearCookie(res, cookieName(auth), { secure: auth.config.secure });
}

/** Signs a device out from afar: from the account page, or by the admin. */
export async function removeDevice(auth: Auth, id: string) {
  await endDeviceSessions(auth, id);
  auth.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
}

export function devicesOf(auth: Auth, personId: string): Device[] {
  const rows = auth.db
    .prepare('SELECT * FROM devices WHERE person_id = ? AND expires_at > ? ORDER BY seen_at DESC')
    .all(personId, now()) as DeviceRow[];
  return rows.map(toDevice);
}

export function findDevice(auth: Auth, id: string): Device | undefined {
  const row = auth.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as
    | DeviceRow
    | undefined;
  return row && toDevice(row);
}

/** A short name for a browser, such as “WeChat on iPhone”, from what it says about itself. */
export function deviceLabel(userAgent = '') {
  const browser =
    [
      [/MicroMessenger/, 'WeChat'],
      [/QQ\//, 'QQ'],
      [/EdgA?\//, 'Edge'],
      [/OPR\//, 'Opera'],
      [/Firefox\/|FxiOS/, 'Firefox'],
      [/Chrome\/|CriOS/, 'Chrome'],
      [/Safari\//, 'Safari'],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? 'A browser';
  const system =
    [
      [/iPhone/, 'iPhone'],
      [/iPad/, 'iPad'],
      [/Android/, 'Android'],
      [/Mac OS X|Macintosh/, 'Mac'],
      [/Windows/, 'Windows'],
      [/CrOS/, 'ChromeOS'],
      [/Linux/, 'Linux'],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? null;
  return system ? `${browser} on ${system}` : String(browser);
}
