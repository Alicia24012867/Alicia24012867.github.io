import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { now } from './db.ts';

/**
 * One-time links, each for one person. An invite signs a browser in for a year; a setup link
 * makes a passkey. Only a hash of each link's token is kept, so the database can't give one away.
 */
export type LinkKind = 'invite' | 'setup';

export type Link = {
  id: string;
  kind: LinkKind;
  personId: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
};

type LinkRow = {
  id: string;
  kind: LinkKind;
  person_id: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
};

const toLink = (row: LinkRow): Link => ({
  id: row.id,
  kind: row.kind,
  personId: row.person_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
});

const hash = (token: string) => crypto.createHash('sha256').update(token).digest();

/** A new link; the token appears only here, to be shown once. */
export function createLink(db: DatabaseSync, personId: string, kind: LinkKind, seconds: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomBytes(9).toString('base64url');
  const time = now();
  db.prepare(
    'INSERT INTO links (id, token_hash, kind, person_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, hash(token), kind, personId, time, time + seconds);
  return { id, token, path: `/${kind}/${token}`, expiresAt: time + seconds };
}

/** The link a token belongs to, used or not. */
export function findLink(db: DatabaseSync, kind: LinkKind, token: string): Link | undefined {
  if (!/^[\w-]{43}$/.test(token)) return undefined;
  const row = db
    .prepare('SELECT * FROM links WHERE token_hash = ? AND kind = ?')
    .get(hash(token), kind) as LinkRow | undefined;
  return row && toLink(row);
}

export const usable = (link: Link) => link.usedAt === null && link.expiresAt > now();

/** Marks a link used. Of two requests racing with one link, only one wins. */
export function useLink(db: DatabaseSync, link: Link) {
  const { changes } = db
    .prepare('UPDATE links SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?')
    .run(now(), link.id, now());
  return changes === 1;
}

export function linksOf(db: DatabaseSync, personId: string): Link[] {
  const rows = db
    .prepare('SELECT * FROM links WHERE person_id = ? ORDER BY created_at DESC')
    .all(personId) as LinkRow[];
  return rows.map(toLink);
}

/** Links not yet used, with the person each is for. */
export function openLinks(db: DatabaseSync) {
  return db
    .prepare(
      `SELECT l.*, p.name AS person_name FROM links l JOIN people p ON p.id = l.person_id
       WHERE l.used_at IS NULL AND l.expires_at > ? ORDER BY l.expires_at`,
    )
    .all(now()) as (LinkRow & { person_name: string })[];
}

export function deleteLink(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM links WHERE id = ?').run(id);
}
