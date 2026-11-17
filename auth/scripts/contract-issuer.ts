import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { saveApp } from '../src/apps.ts';
import type { Auth } from '../src/auth.ts';
import { now } from '../src/db.ts';
import { start } from '../src/main.ts';
import { createPerson, setDisabled, type Person } from '../src/people.ts';
import { forgetPerson } from '../src/sessions.ts';

/**
 * The sign-in service for the blog API's contract tests (web/scripts/api/check.mjs). It runs on
 * this computer with an empty database of its own, which is gone when it stops:
 *
 *   node scripts/contract-issuer.ts [--port 3999] [--site http://localhost:8080]
 *
 * The blog is registered as the app `blog`, with the secret `contract-test-secret` and the
 * addresses of a backend at `--site`. Five readers are already signed in on devices whose
 * cookies the tests ask for, so a sign-in never stops at a page. For the tests alone:
 *
 *   GET  /contract/readers               each reader's id, name, groups and device cookie
 *   POST /contract/readers/<role>/off    turns a reader off, as the admin page does
 *   POST /contract/readers/<role>/on     turns them back on, on a new device
 */

const { values: options } = parseArgs({
  options: {
    port: { type: 'string', default: '3999' },
    site: { type: 'string', default: 'http://localhost:8080' },
  },
});
const port = Number(options.port);
const site = new URL(options.site!).origin;
const secret = 'contract-test-secret';

const roles = {
  admin: { name: '测试管理员', groups: ['admin'] },
  family: { name: '测试家人', groups: ['family'] },
  friend: { name: '测试朋友', groups: ['friends'] },
  guest: { name: '测试访客', groups: [] },
  // Turned off by the tests, to see the backend hear of it.
  leaver: { name: '测试离开的人', groups: ['friends'] },
} satisfies Record<string, { name: string; groups: string[] }>;
type Role = keyof typeof roles;

// Said plainly, rather than as a crash once the database exists.
await new Promise<void>((resolve) => {
  const probe = net.createServer();
  probe.once('error', () => {
    console.error(`端口 ${port} 已被占用：先停掉占用它的程序，或者换一个 --port`);
    process.exit(1);
  });
  probe.listen(port, () => probe.close(() => resolve()));
});

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'contract-issuer-'));
// The database is for this run alone, however it ends.
process.once('exit', () => rmSync(dataDir, { recursive: true, force: true }));
const service = await start(
  {
    issuer: `http://localhost:${port}`,
    home: `${site}/`,
    rpID: 'localhost',
    rpName: 'nymphilia.com',
    dataDir,
    port,
    secure: false,
  },
  {
    // The provider won't post logout tokens to this computer's own addresses, except here.
    fetch: (url, init) => {
      const { dispatcher: _, ...rest } = (init ?? {}) as RequestInit & { dispatcher?: unknown };
      return fetch(url, rest);
    },
  },
);
const auth: Auth = service.auth;

await saveApp(auth, {
  id: 'blog',
  name: 'The blog, under contract tests',
  redirectUris: [`${site}/api/auth/callback`],
  postLogoutRedirectUris: [`${site}/`],
  backchannelLogoutUri: `${site}/api/auth/backchannel-logout`,
  refreshTokens: true,
  native: false,
  confidential: true,
});
auth.db.prepare('UPDATE apps SET secret = ? WHERE id = ?').run(secret, 'blog');

/** A device that remembers `person`, as an invite or a passkey would leave it. */
function remember(person: Person, role: Role) {
  const id = `contract-${role}-${crypto.randomBytes(6).toString('hex')}`;
  const deviceSecret = crypto.randomBytes(32).toString('base64url');
  const time = now();
  // Admins sign in with passkeys only.
  const passkeyAt = role === 'admin' ? time : null;
  auth.db
    .prepare(
      `INSERT INTO devices (id, person_id, secret_hash, method, label, created_at, seen_at, expires_at, passkey_at)
       VALUES (?, ?, ?, ?, 'Contract tests', ?, ?, ?, ?)`,
    )
    .run(
      id,
      person.id,
      crypto.createHash('sha256').update(deviceSecret).digest(),
      passkeyAt ? 'passkey' : 'invite',
      time,
      time,
      time + 86400,
      passkeyAt,
    );
  return `device=${id}.${deviceSecret}`;
}

const readers = new Map<Role, { person: Person; cookie: string }>();
for (const role of Object.keys(roles) as Role[]) {
  const person = createPerson(auth.db, roles[role].name, roles[role].groups);
  readers.set(role, { person, cookie: remember(person, role) });
}

function answer(res: ServerResponse, status: number, value?: unknown) {
  res.writeHead(status, value === undefined ? {} : { 'content-type': 'application/json' });
  res.end(value === undefined ? undefined : JSON.stringify(value));
}

async function control(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/contract/readers') {
    return answer(res, 200, {
      issuer: `http://localhost:${port}`,
      clientId: 'blog',
      site,
      readers: Object.fromEntries(
        [...readers].map(([role, { person, cookie }]) => [
          role,
          { id: person.id, name: person.name, groups: person.groups, cookie },
        ]),
      ),
    });
  }
  const match = /^\/contract\/readers\/(\w+)\/(off|on)$/.exec(url.pathname);
  const reader = match && readers.get(match[1] as Role);
  if (req.method !== 'POST' || !match || !reader) return answer(res, 404);
  const off = match[2] === 'off';
  setDisabled(auth.db, reader.person.id, off);
  if (off) {
    // As the admin page does: apps hear of it, and the person's devices are forgotten.
    await forgetPerson(auth, reader.person.id);
    auth.db.prepare('DELETE FROM devices WHERE person_id = ?').run(reader.person.id);
  } else reader.cookie = remember(reader.person, match[1] as Role);
  return answer(res, 200, { cookie: reader.cookie });
}

// The tests' own addresses come first; everything else is the service as it always runs.
const [handle] = service.server.listeners('request') as RequestListener[];
service.server.removeAllListeners('request');
service.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
  if (req.url?.startsWith('/contract/'))
    control(req, res).catch((error: unknown) => answer(res, 500, { error: String(error) }));
  else handle!(req, res);
});

console.log(`测试用登录服务：http://localhost:${port}`);
console.log(`  应用 blog，客户端密钥 ${secret}，跳回 ${site}/api/auth/callback`);
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    service.close().then(() => process.exit(0));
  });
}
