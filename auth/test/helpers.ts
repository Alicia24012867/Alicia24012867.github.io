import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as oidc from 'openid-client';
import { saveApp, type App } from '../src/apps.ts';
import type { Auth } from '../src/auth.ts';
import type { Config } from '../src/config.ts';
import { now } from '../src/db.ts';
import { createLink } from '../src/links.ts';
import { start } from '../src/main.ts';
import { createPerson, type Person } from '../src/people.ts';

/** A port no one is listening on, so the issuer can name it before the service starts. */
export async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** The service on a free port with an empty database of its own. */
export async function startService(overrides: Partial<Config> = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));
  const port = await freePort();
  const config: Config = {
    issuer: `http://localhost:${port}`,
    home: 'https://nymphilia.com/',
    rpID: 'localhost',
    rpName: 'nymphilia.com',
    dataDir,
    port,
    secure: false,
    ...overrides,
  };
  // The provider's guard against posting to private addresses stays, except for the test's app.
  const service = await start(config, {
    fetch: (url, init) => {
      const { dispatcher: _, ...rest } = (init ?? {}) as RequestInit & { dispatcher?: unknown };
      return fetch(url, rest);
    },
  });
  return {
    ...service,
    issuer: config.issuer,
    async stop() {
      await service.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

type Cookie = { name: string; value: string; path: string };

/**
 * A browser without a screen: it keeps cookies by name and path, sends an Origin with each POST
 * as a page would, and follows redirects only within the service.
 */
export class Browser {
  cookies: Cookie[] = [];
  readonly base: string;
  readonly userAgent: string;
  constructor(
    base: string,
    userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) MicroMessenger/8.0',
  ) {
    this.base = base;
    this.userAgent = userAgent;
  }

  cookie(name: string) {
    return this.cookies.find((cookie) => cookie.name === name)?.value;
  }

  private remember(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const at = pair!.indexOf('=');
      const name = pair!.slice(0, at);
      const value = pair!.slice(at + 1);
      let cookiePath = '/';
      let gone = false;
      for (const attribute of attributes) {
        const [key, setting = ''] = attribute.split('=');
        const lower = key!.toLowerCase();
        if (lower === 'path') cookiePath = setting;
        if (lower === 'max-age' && Number(setting) <= 0) gone = true;
        if (lower === 'expires' && Date.parse(setting) <= Date.now()) gone = true;
      }
      this.cookies = this.cookies.filter((c) => !(c.name === name && c.path === cookiePath));
      if (!gone) this.cookies.push({ name, value, path: cookiePath });
    }
  }

  async request(
    target: string | URL,
    init: {
      method?: string;
      form?: Record<string, string> | [string, string][];
      json?: unknown;
      /** The page a POST comes from; null sends none, as some browsers don't. */
      origin?: string | null;
      headers?: Record<string, string>;
    } = {},
  ) {
    const url = new URL(target, this.base);
    const headers = new Headers({ 'user-agent': this.userAgent, ...init.headers });
    const sent = this.cookies.filter(
      (cookie) =>
        url.pathname === cookie.path || url.pathname.startsWith(cookie.path.replace(/\/?$/, '/')),
    );
    if (sent.length) headers.set('cookie', sent.map((c) => `${c.name}=${c.value}`).join('; '));
    let body: string | undefined;
    if (init.form) {
      body = new URLSearchParams(init.form).toString();
      headers.set('content-type', 'application/x-www-form-urlencoded');
    } else if (init.json !== undefined) {
      body = JSON.stringify(init.json);
      headers.set('content-type', 'application/json');
    }
    const method = init.method ?? (body === undefined ? 'GET' : 'POST');
    if (method === 'POST' && init.origin !== null) {
      headers.set('origin', init.origin ?? new URL(this.base).origin);
    }
    const response = await fetch(url, { method, headers, body, redirect: 'manual' });
    this.remember(response);
    return response;
  }

  /** Follows redirects inside the service. `left` is where one pointed elsewhere, if it did. */
  async follow(target: string | URL, init: Parameters<Browser['request']>[1] = {}) {
    let url = new URL(target, this.base);
    let response = await this.request(url, init);
    for (let hops = 0; hops < 20 && response.status >= 300 && response.status < 400; hops++) {
      const next = new URL(response.headers.get('location')!, url);
      if (next.origin !== new URL(this.base).origin) return { response, url, left: next };
      url = next;
      response = await this.request(url);
    }
    return { response, url, left: undefined };
  }
}

/** The value of a form field or hidden input in a page. */
export function field(page: string, name: string) {
  const match = new RegExp(`name="${name}" value="([^"]*)"`).exec(page);
  return match?.[1];
}

export function addPerson(auth: Auth, name: string, groups: string[]) {
  return createPerson(auth.db, name, groups);
}

/** An invite opened in `browser`: the person is signed in there for a year. */
export async function acceptInvite(auth: Auth, browser: Browser, person: Person) {
  const link = createLink(auth.db, person.id, 'invite', 7 * 86400);
  const response = await browser.request(link.path, { form: {} });
  if (response.status !== 303 || response.headers.get('location') !== '/welcome') {
    throw new Error(`the invite failed: ${response.status} ${await response.text()}`);
  }
  return link;
}

/**
 * Signs `browser` in as `person` as if with a passkey a moment ago, as the admin pages require,
 * without a passkey: the device row is written here and its cookie handed to the browser.
 */
export function passkeyDevice(auth: Auth, browser: Browser, person: Person) {
  const id = crypto.randomBytes(12).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  const time = now();
  auth.db
    .prepare(
      `INSERT INTO devices (id, person_id, secret_hash, method, label, created_at, seen_at, expires_at, passkey_at)
       VALUES (?, ?, ?, 'passkey', 'Test', ?, ?, ?, ?)`,
    )
    .run(
      id,
      person.id,
      crypto.createHash('sha256').update(secret).digest(),
      time,
      time,
      time + 86400,
      time,
    );
  browser.cookies.push({ name: 'device', value: `${id}.${secret}`, path: '/' });
  return id;
}

/** An app's server: it takes the redirect back and records the logout tokens posted to it. */
export async function appServer() {
  const logouts: string[] = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/backchannel') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        logouts.push(new URLSearchParams(body).get('logout_token') ?? '');
        res.end();
      });
      return;
    }
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  const origin = `http://localhost:${port}`;
  return {
    origin,
    logouts,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function registerApp(auth: Auth, app: Partial<App> & { id: string; origin: string }) {
  const { secret } = await saveApp(auth, {
    name: app.name ?? 'The blog',
    redirectUris: app.redirectUris ?? [`${app.origin}/callback`],
    postLogoutRedirectUris: app.postLogoutRedirectUris ?? [`${app.origin}/`],
    backchannelLogoutUri:
      app.backchannelLogoutUri === undefined
        ? `${app.origin}/backchannel`
        : app.backchannelLogoutUri,
    refreshTokens: app.refreshTokens ?? true,
    native: app.native ?? false,
    confidential: app.confidential ?? true,
    id: app.id,
  });
  return secret;
}

/** The app's view of the provider, through openid-client, as a Rust or Node app would see it. */
export async function discover(issuer: string, clientId: string, secret: string | null) {
  return oidc.discovery(
    new URL(issuer),
    clientId,
    secret ?? undefined,
    secret ? oidc.ClientSecretBasic(secret) : oidc.None(),
    { execute: [oidc.allowInsecureRequests] },
  );
}

/** Starts an authorization as the app would; `finish` trades the code it gets back for tokens. */
export async function authorization(
  config: oidc.Configuration,
  redirectUri: string,
  scope = 'openid profile groups',
  extra: Record<string, string> = {},
) {
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope,
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    ...extra,
  });
  return {
    url,
    finish: (callback: URL) =>
      oidc.authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
      }),
  };
}

/** The claims of a signed token, once its signature checks out against the provider's keys. */
export async function verifiedClaims(issuer: string, token: string) {
  const [header, payload, signature] = token.split('.');
  const { kid, alg } = JSON.parse(Buffer.from(header!, 'base64url').toString());
  if (alg !== 'RS256') throw new Error(`unexpected alg ${alg}`);
  const { keys } = (await (await fetch(`${issuer}/jwks`)).json()) as { keys: crypto.JsonWebKey[] };
  const jwk = keys.find((key) => key.kid === kid);
  if (!jwk) throw new Error(`no key ${kid}`);
  const ok = crypto.verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(signature!, 'base64url'),
  );
  if (!ok) throw new Error('bad signature');
  return JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<string, unknown>;
}

/** A token's claims, unchecked. */
export const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>;

/** Waits for a condition the service reaches on its own, such as a logout token arriving. */
export async function eventually<T>(check: () => T | undefined, ms = 3000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
