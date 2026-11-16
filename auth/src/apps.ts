import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ClientMetadata } from 'oidc-provider';
import type { Auth } from './auth.ts';
import { now } from './db.ts';
import { HttpError } from './http.ts';

/**
 * An application that signs people in here, such as the blog. The admin page registers each one;
 * the provider reads them through the adapter as OpenID Connect clients.
 */
export type App = {
  id: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  /** Where the provider posts a logout token when someone signs out or is turned off. */
  backchannelLogoutUri: string | null;
  refreshTokens: boolean;
  /** Runs on someone's own computer, such as a backend in development on localhost. */
  native: boolean;
  /** Keeps a secret, as a server does; a page in a browser can't. */
  confidential: boolean;
  createdAt: number;
  updatedAt: number;
};

type AppRow = {
  id: string;
  secret: string | null;
  metadata: string;
  created_at: number;
  updated_at: number;
};

type Stored = Omit<App, 'id' | 'createdAt' | 'updatedAt'>;

const toApp = (row: AppRow): App => ({
  ...(JSON.parse(row.metadata) as Stored),
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Ids appear in configuration files and URLs: short, lower case. */
export const appIdPattern = /^[a-z][a-z0-9-]{1,31}$/;

function metadataOf(app: Stored & { id: string }, secret: string | null): ClientMetadata {
  return {
    client_id: app.id,
    ...(app.confidential && secret !== null && { client_secret: secret }),
    client_name: app.name,
    application_type: app.native ? 'native' : 'web',
    redirect_uris: app.redirectUris,
    post_logout_redirect_uris: app.postLogoutRedirectUris,
    grant_types: app.refreshTokens
      ? ['authorization_code', 'refresh_token']
      : ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: app.confidential ? 'client_secret_basic' : 'none',
    ...(app.backchannelLogoutUri && {
      backchannel_logout_uri: app.backchannelLogoutUri,
      backchannel_logout_session_required: true,
    }),
  };
}

export function listApps(db: DatabaseSync): App[] {
  return (db.prepare('SELECT * FROM apps ORDER BY id').all() as AppRow[]).map(toApp);
}

export function findApp(db: DatabaseSync, id: string): App | undefined {
  const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined;
  return row && toApp(row);
}

/** The client the provider asks the adapter for. */
export function clientMetadata(db: DatabaseSync, id: string): ClientMetadata | undefined {
  const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined;
  return row && metadataOf(toApp(row), row.secret);
}

/**
 * Registers an app or changes one. The provider checks the settings first; a new confidential
 * app, or one asked for a new secret, gets a secret, returned only here.
 */
export async function saveApp(
  auth: Auth,
  app: Stored & { id: string },
  options: { newSecret?: boolean } = {},
) {
  if (!appIdPattern.test(app.id)) {
    throw new HttpError(400, 'An app id is 2 to 32 of a-z, 0-9 and -, starting with a letter.');
  }
  const row = auth.db.prepare('SELECT secret FROM apps WHERE id = ?').get(app.id) as
    | { secret: string | null }
    | undefined;
  const fresh = app.confidential && (options.newSecret || !row?.secret);
  const secret = !app.confidential
    ? null
    : fresh
      ? crypto.randomBytes(32).toString('base64url')
      : row!.secret;
  try {
    await auth.provider.Client.validate(metadataOf(app, secret));
  } catch (error) {
    const { error_description: detail, message } = error as Error & { error_description?: string };
    throw new HttpError(400, `The provider refused these settings: ${detail ?? message}`);
  }
  const stored: Stored = {
    name: app.name,
    redirectUris: app.redirectUris,
    postLogoutRedirectUris: app.postLogoutRedirectUris,
    backchannelLogoutUri: app.backchannelLogoutUri,
    refreshTokens: app.refreshTokens,
    native: app.native,
    confidential: app.confidential,
  };
  auth.db
    .prepare(
      `INSERT INTO apps (id, secret, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET secret = excluded.secret, metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
    )
    .run(app.id, secret, JSON.stringify(stored), now(), now());
  return { secret: fresh ? secret : null };
}

/** Removes an app, with the grants and tokens it held. */
export function deleteApp(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM apps WHERE id = ?').run(id);
  db.prepare("DELETE FROM oidc WHERE json_extract(payload, '$.clientId') = ?").run(id);
}

/** Where a form here may end up, through the provider's redirects: the apps' own addresses. */
export function appOrigins(db: DatabaseSync) {
  const origins = new Set<string>();
  for (const app of listApps(db)) {
    for (const uri of [...app.redirectUris, ...app.postLogoutRedirectUris]) {
      try {
        const { protocol, origin } = new URL(uri);
        if (protocol === 'https:' || protocol === 'http:') origins.add(origin);
      } catch {
        /* The provider refuses such addresses when they're registered. */
      }
    }
  }
  return [...origins].join(' ');
}
