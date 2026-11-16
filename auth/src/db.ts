import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Times are whole seconds since 1970, as in tokens. */
export const now = () => Math.floor(Date.now() / 1000);

/**
 * Each step brings an older database up to date. Steps are only ever added, never changed: the
 * database records how many it has taken in user_version.
 */
const migrations = [
  `
  CREATE TABLE people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    disabled_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE groups (
    name TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE memberships (
    person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    group_name TEXT NOT NULL REFERENCES groups (name) ON DELETE CASCADE,
    PRIMARY KEY (person_id, group_name)
  );
  INSERT INTO groups (name, label, created_at) VALUES
    ('admin', 'Administrators', unixepoch()),
    ('family', 'Family', unixepoch()),
    ('friends', 'Friends', unixepoch());

  -- A browser that someone signed in on. The cookie holds the id and a secret; only the
  -- secret's hash is kept here.
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    secret_hash BLOB NOT NULL,
    method TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    passkey_at INTEGER
  );
  CREATE INDEX devices_person ON devices (person_id);

  -- Which browser each of the provider's sessions began on, so that signing a device out ends
  -- its sessions with applications too.
  CREATE TABLE session_devices (
    session_uid TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE
  );
  CREATE INDEX session_devices_device ON session_devices (device_id);

  CREATE TABLE passkeys (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT NOT NULL,
    label TEXT NOT NULL,
    backed_up INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE INDEX passkeys_person ON passkeys (person_id);

  -- One-time links: an invite signs a browser in, a setup link makes a passkey. Only the
  -- token's hash is kept.
  CREATE TABLE links (
    id TEXT PRIMARY KEY,
    token_hash BLOB NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE INDEX links_person ON links (person_id);

  -- A passkey ceremony in progress: the challenge the browser must sign.
  CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    person_id TEXT,
    challenge TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    person_id TEXT,
    actor_id TEXT,
    detail TEXT,
    ip TEXT,
    device TEXT
  );
  CREATE INDEX events_person ON events (person_id, at);

  -- The applications that sign people in here. The secret is kept as it is: the provider
  -- compares it with what the application sends.
  CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    secret TEXT,
    metadata TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- What oidc-provider keeps: sessions, grants, codes and tokens, each as JSON.
  CREATE TABLE oidc (
    model TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    expires_at INTEGER,
    grant_id TEXT,
    uid TEXT,
    user_code TEXT,
    account_id TEXT,
    PRIMARY KEY (model, id)
  );
  CREATE INDEX oidc_grant ON oidc (grant_id);
  CREATE INDEX oidc_uid ON oidc (uid);
  CREATE INDEX oidc_account ON oidc (account_id);
  CREATE INDEX oidc_expires ON oidc (expires_at);
  `,
];

export function openDatabase(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'auth.db'));
  // The server and the command line share the file; each waits briefly for the other's writes.
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (version > migrations.length) {
    throw new Error(`The database is from a newer version of this service (${version})`);
  }
  for (let step = version; step < migrations.length; step++) {
    transaction(db, () => {
      db.exec(migrations[step]!);
      db.exec(`PRAGMA user_version = ${step + 1}`);
    });
  }
  return db;
}

/** Runs `work` as one transaction, which another process's writes wait for. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Deletes what has run out: provider records, ceremonies, links, devices and old events. */
export function sweep(db: DatabaseSync) {
  const time = now();
  db.prepare('DELETE FROM oidc WHERE expires_at <= ?').run(time);
  db.prepare('DELETE FROM challenges WHERE expires_at <= ?').run(time);
  // Used and expired links stay a month, so the admin page can show what became of them.
  db.prepare('DELETE FROM links WHERE expires_at <= ?').run(time - 30 * 86400);
  // A device that has run out takes its sessions with it, and so the tokens apps hold.
  db.prepare(
    `DELETE FROM oidc WHERE model = 'Session' AND uid IN (
       SELECT s.session_uid FROM session_devices s JOIN devices d ON d.id = s.device_id
       WHERE d.expires_at <= ?)`,
  ).run(time);
  db.prepare('DELETE FROM devices WHERE expires_at <= ?').run(time);
  db.prepare(
    "DELETE FROM session_devices WHERE session_uid NOT IN (SELECT uid FROM oidc WHERE model = 'Session')",
  ).run();
  db.prepare('DELETE FROM events WHERE at <= ?').run(time - 365 * 86400);
}
