import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { now, transaction } from './db.ts';

export type Person = {
  id: string;
  name: string;
  email: string | null;
  disabledAt: number | null;
  createdAt: number;
  groups: string[];
};

export type Group = { name: string; label: string; members: number };

type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  disabled_at: number | null;
  created_at: number;
  groups: string | null;
};

const selectPeople = `
  SELECT p.*, (SELECT group_concat(group_name, ' ') FROM memberships WHERE person_id = p.id) AS groups
  FROM people p`;

const toPerson = (row: PersonRow): Person => ({
  id: row.id,
  name: row.name,
  email: row.email,
  disabledAt: row.disabled_at,
  createdAt: row.created_at,
  groups: row.groups ? row.groups.split(' ').sort() : [],
});

export const isAdmin = (person: Person) => person.groups.includes('admin');

export function findPerson(db: DatabaseSync, id: string): Person | undefined {
  const row = db.prepare(`${selectPeople} WHERE p.id = ?`).get(id) as PersonRow | undefined;
  return row && toPerson(row);
}

/** Someone who may sign in: known, and not disabled. */
export function activePerson(db: DatabaseSync, id: string): Person | undefined {
  const person = findPerson(db, id);
  return person && person.disabledAt === null ? person : undefined;
}

export function listPeople(db: DatabaseSync): Person[] {
  const rows = db.prepare(`${selectPeople} ORDER BY p.name COLLATE NOCASE`).all() as PersonRow[];
  return rows.map(toPerson);
}

export function listGroups(db: DatabaseSync): Group[] {
  return db
    .prepare(
      `SELECT g.name, g.label, count(m.person_id) AS members
       FROM groups g LEFT JOIN memberships m ON m.group_name = g.name
       GROUP BY g.name ORDER BY g.name = 'admin' DESC, g.name`,
    )
    .all() as Group[];
}

/** Names are what applications see in the groups claim, so they stay short and plain. */
export const groupNamePattern = /^[a-z][a-z0-9-]{0,31}$/;

export function createGroup(db: DatabaseSync, name: string, label: string) {
  if (!groupNamePattern.test(name)) throw new Error('A group name is a-z, 0-9 and -');
  db.prepare('INSERT INTO groups (name, label, created_at) VALUES (?, ?, ?)').run(
    name,
    label,
    now(),
  );
}

export function deleteGroup(db: DatabaseSync, name: string) {
  if (name === 'admin') throw new Error('The admin group stays');
  db.prepare('DELETE FROM groups WHERE name = ?').run(name);
}

function setGroups(db: DatabaseSync, id: string, groups: string[]) {
  db.prepare('DELETE FROM memberships WHERE person_id = ?').run(id);
  const insert = db.prepare('INSERT INTO memberships (person_id, group_name) VALUES (?, ?)');
  for (const group of new Set(groups)) insert.run(id, group);
}

export function createPerson(db: DatabaseSync, name: string, groups: string[]): Person {
  const id = crypto.randomUUID();
  transaction(db, () => {
    db.prepare('INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now());
    setGroups(db, id, groups);
  });
  return findPerson(db, id)!;
}

export function updatePerson(
  db: DatabaseSync,
  id: string,
  change: { name: string; email: string | null; groups: string[] },
) {
  transaction(db, () => {
    db.prepare('UPDATE people SET name = ?, email = ? WHERE id = ?').run(
      change.name,
      change.email,
      id,
    );
    setGroups(db, id, change.groups);
  });
}

export function setDisabled(db: DatabaseSync, id: string, disabled: boolean) {
  db.prepare('UPDATE people SET disabled_at = ? WHERE id = ?').run(disabled ? now() : null, id);
}

export function deletePerson(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM people WHERE id = ?').run(id);
}

/**
 * What applications may learn about someone. The provider passes on only the claims of the
 * scopes an application asked for: name with profile, groups with groups, email with email.
 */
export function claimsFor(person: Person) {
  return {
    sub: person.id,
    name: person.name,
    groups: person.groups,
    // Written in by the admin, not yet confirmed by the person.
    ...(person.email !== null && { email: person.email, email_verified: false }),
  };
}

export type Event = {
  at: number;
  kind: string;
  personId: string | null;
  personName: string | null;
  actorName: string | null;
  detail: string | null;
  ip: string | null;
  device: string | null;
};

/** The visitor's address, as Caddy saw it. */
export function clientIp(req: IncomingMessage) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || null;
}

/** Notes a sign-in or a change for the activity lists on the admin page. */
export function logEvent(
  db: DatabaseSync,
  kind: string,
  details: {
    personId?: string | null;
    actorId?: string | null;
    detail?: string | null;
    req?: IncomingMessage;
    device?: string | null;
  } = {},
) {
  db.prepare(
    'INSERT INTO events (at, kind, person_id, actor_id, detail, ip, device) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    now(),
    kind,
    details.personId ?? null,
    details.actorId ?? null,
    details.detail ?? null,
    details.req ? clientIp(details.req) : null,
    details.device ?? null,
  );
}

export function recentEvents(db: DatabaseSync, options: { personId?: string; limit: number }) {
  const where = options.personId ? 'WHERE e.person_id = ?' : '';
  const rows = db
    .prepare(
      `SELECT e.at, e.kind, e.person_id AS personId, p.name AS personName, a.name AS actorName,
              e.detail, e.ip, e.device
       FROM events e LEFT JOIN people p ON p.id = e.person_id LEFT JOIN people a ON a.id = e.actor_id
       ${where} ORDER BY e.id DESC LIMIT ?`,
    )
    .all(...(options.personId ? [options.personId] : []), options.limit);
  return rows as Event[];
}
