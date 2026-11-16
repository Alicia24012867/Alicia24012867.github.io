import type { Auth } from './auth.ts';
import { clearCookie, type Req, type Res } from './http.ts';

/**
 * The provider's own sign-in sessions. Each records the applications a browser signed in to;
 * when one ends here, those applications hear of it by back-channel logout, and the tokens they
 * were given stop working.
 */
type Session = {
  id: string;
  accountId?: string;
  authorizations?: Record<string, { sid?: string }>;
};

/** What the provider's clients can do, beyond what its types say. */
type LogoutClient = {
  backchannelLogoutUri?: string;
  backchannelLogout(sub: string, sid: string): Promise<void>;
};

async function endSessions(auth: Auth, sessions: Session[]) {
  const notices: Promise<void>[] = [];
  for (const session of sessions) {
    auth.db.prepare("DELETE FROM oidc WHERE model = 'Session' AND id = ?").run(session.id);
    if (!session.accountId) continue;
    for (const [clientId, { sid }] of Object.entries(session.authorizations ?? {})) {
      const client = (await auth.provider.Client.find(clientId)) as LogoutClient | undefined;
      if (!client?.backchannelLogoutUri || !sid) continue;
      notices.push(
        client.backchannelLogout(session.accountId, sid).catch((error: Error) => {
          console.error(`back-channel logout to ${clientId} failed: ${error.message}`);
        }),
      );
    }
  }
  await Promise.all(notices);
}

function storedSessions(auth: Auth, where: string, value: string): Session[] {
  const rows = auth.db
    .prepare(`SELECT o.id, o.payload FROM oidc o WHERE o.model = 'Session' AND ${where}`)
    .all(value) as { id: string; payload: string }[];
  return rows.map((row) => ({ ...(JSON.parse(row.payload) as Session), id: row.id }));
}

/** Ends the sessions that began on one device. */
export async function endDeviceSessions(auth: Auth, deviceId: string) {
  await endSessions(
    auth,
    storedSessions(
      auth,
      'o.uid IN (SELECT session_uid FROM session_devices WHERE device_id = ?)',
      deviceId,
    ),
  );
}

/** Ends every session of one person. */
export async function endPersonSessions(auth: Auth, personId: string) {
  await endSessions(auth, storedSessions(auth, 'o.account_id = ?', personId));
}

/** Ends everything the provider holds for one person: sessions, grants, codes and tokens. */
export async function forgetPerson(auth: Auth, personId: string) {
  await endPersonSessions(auth, personId);
  auth.db.prepare('DELETE FROM oidc WHERE account_id = ?').run(personId);
}

/** Ends the session this browser holds, if any, and clears its cookie. */
export async function endBrowserSession(auth: Auth, req: Req, res: Res) {
  const session = await auth.provider.Session.get(auth.provider.createContext(req, res));
  if (session.accountId) {
    await endSessions(auth, [
      { id: session.jti, accountId: session.accountId, authorizations: session.authorizations },
    ]);
  }
  const name = auth.provider.cookieName('session');
  for (const cookie of [name, `${name}.sig`]) {
    clearCookie(res, cookie, { secure: auth.config.secure });
  }
}

/** Notes which device a session began on, as the provider signs a browser in to an app. */
export function recordSessionDevice(auth: Auth, sessionUid: string, deviceId: string) {
  auth.db
    .prepare(
      `INSERT INTO session_devices (session_uid, device_id) VALUES (?, ?)
       ON CONFLICT (session_uid) DO UPDATE SET device_id = excluded.device_id`,
    )
    .run(sessionUid, deviceId);
}
