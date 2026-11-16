import type { DatabaseSync } from 'node:sqlite';
import type { Adapter, AdapterConstructor, AdapterPayload } from 'oidc-provider';
import { clientMetadata } from './apps.ts';
import { now } from './db.ts';

/**
 * Keeps oidc-provider's records in SQLite: one table, one JSON row per session, grant, code or
 * token, with the fields it looks things up by beside it. Clients come from the apps table.
 */
export function sqliteAdapter(db: DatabaseSync): AdapterConstructor {
  const live = (row: { payload: string; expires_at: number | null } | undefined) =>
    row && (row.expires_at === null || row.expires_at > now())
      ? (JSON.parse(row.payload) as AdapterPayload)
      : undefined;

  return class SqliteAdapter implements Adapter {
    model: string;

    constructor(model: string) {
      this.model = model;
    }

    async upsert(id: string, payload: AdapterPayload, expiresIn?: number) {
      if (this.model === 'Client') throw new Error('Apps are registered on the admin page');
      db.prepare(
        `INSERT INTO oidc (model, id, payload, expires_at, grant_id, uid, user_code, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (model, id) DO UPDATE SET payload = excluded.payload,
           expires_at = excluded.expires_at, grant_id = excluded.grant_id, uid = excluded.uid,
           user_code = excluded.user_code, account_id = excluded.account_id`,
      ).run(
        this.model,
        id,
        JSON.stringify(payload),
        typeof expiresIn === 'number' ? now() + expiresIn : null,
        payload.grantId ?? null,
        payload.uid ?? null,
        payload.userCode ?? null,
        payload.accountId ?? null,
      );
    }

    async find(id: string) {
      if (this.model === 'Client') return clientMetadata(db, id);
      return live(
        db
          .prepare('SELECT payload, expires_at FROM oidc WHERE model = ? AND id = ?')
          .get(this.model, id) as { payload: string; expires_at: number | null } | undefined,
      );
    }

    async findByUid(uid: string) {
      return live(
        db
          .prepare('SELECT payload, expires_at FROM oidc WHERE model = ? AND uid = ?')
          .get(this.model, uid) as { payload: string; expires_at: number | null } | undefined,
      );
    }

    async findByUserCode(userCode: string) {
      return live(
        db
          .prepare('SELECT payload, expires_at FROM oidc WHERE model = ? AND user_code = ?')
          .get(this.model, userCode) as { payload: string; expires_at: number | null } | undefined,
      );
    }

    async consume(id: string) {
      db.prepare(
        "UPDATE oidc SET payload = json_set(payload, '$.consumed', ?) WHERE model = ? AND id = ?",
      ).run(now(), this.model, id);
    }

    async destroy(id: string) {
      db.prepare('DELETE FROM oidc WHERE model = ? AND id = ?').run(this.model, id);
    }

    async revokeByGrantId(grantId: string) {
      db.prepare('DELETE FROM oidc WHERE model = ? AND grant_id = ?').run(this.model, grantId);
    }
  };
}
