import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { InteractionResults } from 'oidc-provider';
import { adminRoutes } from './admin.ts';
import { appOrigins } from './apps.ts';
import type { Auth } from './auth.ts';
import { currentDevice, devicesOf, findDevice, removeDevice, signIn, signOut } from './devices.ts';
import { layout } from './html.ts';
import {
  HttpError,
  fromOwnPage,
  pageHeaders,
  readJson,
  redirect,
  sendHtml,
  sendJson,
  type Req,
  type Res,
} from './http.ts';
import { findLink, usable, useLink } from './links.ts';
import {
  accountPage,
  invitePage,
  loginPage,
  messagePage,
  setupPage,
  signInPage,
  signedOutPage,
  welcomePage,
} from './pages.ts';
import {
  deletePasskey,
  finishAuthentication,
  finishRegistration,
  passkeysOf,
  startAuthentication,
  startRegistration,
} from './passkeys.ts';
import { activePerson, isAdmin, logEvent } from './people.ts';
import {
  Redirect,
  get,
  localPath,
  post,
  postJson,
  requireSignedIn,
  show,
  type Ctx,
  type Route,
} from './routes.ts';
import { endBrowserSession, recordSessionDevice } from './sessions.ts';

const root = path.resolve(import.meta.dirname, '..');

/** Files the pages load, read once, each with a hash for revalidation. */
function staticFiles() {
  const files: Record<string, [string, string]> = {
    'style.css': ['public/style.css', 'text/css'],
    'fonts.css': ['public/fonts.css', 'text/css'],
    'favicon.svg': ['public/favicon.svg', 'image/svg+xml'],
    'auth.js': ['public/auth.js', 'text/javascript'],
    'webauthn.js': [
      'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js',
      'text/javascript',
    ],
  };
  return new Map(
    Object.entries(files).map(([name, [file, type]]) => {
      const body = fs.readFileSync(path.join(root, file));
      const etag = `"${crypto.createHash('sha256').update(body).digest('base64url').slice(0, 16)}"`;
      return [name, { body, type: `${type}; charset=utf-8`, etag }];
    }),
  );
}

/** The person an invite or setup link is for, if the link can still be used. */
function linkPerson(ctx: Ctx, kind: 'invite' | 'setup') {
  const token = ctx.params[0]!;
  const link = findLink(ctx.auth.db, kind, token);
  const person = link && usable(link) ? activePerson(ctx.auth.db, link.personId) : undefined;
  if (!link || !person) {
    throw new HttpError(
      410,
      kind === 'invite'
        ? 'This invite link has been used or has expired. Ask for a new one.'
        : 'This link has been used or has expired. Ask for a new one.',
    );
  }
  return { token, link, person };
}

/** The interaction this browser is in, by its cookie, or a page saying it has run out. */
async function interaction(ctx: Ctx) {
  try {
    const details = await ctx.auth.provider.interactionDetails(ctx.req, ctx.res);
    if (details.uid === ctx.params[0]) return details;
  } catch {
    /* No cookie, or the interaction expired: answered below. */
  }
  throw new HttpError(410, 'This sign-in has expired. Go back to the site and sign in again.');
}

type Details = Awaited<ReturnType<typeof interaction>>;

/**
 * The application's original request, to start again from. When a browser holds a session for
 * someone other than who is signing in, that session ends, and the request starts afresh.
 */
function restart(details: Details) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(details.params)) {
    if (typeof value === 'string') query.set(key, value);
  }
  return `/auth?${query}`;
}

const finish = (ctx: Ctx, result: InteractionResults) =>
  ctx.auth.provider.interactionFinished(ctx.req, ctx.res, result, {
    mergeWithLastSubmission: false,
  });

const publicRoutes: Route[] = [
  get(/^\/$/, (ctx) => {
    throw new Redirect(currentDevice(ctx.auth, ctx.req) ? '/account' : '/login?next=/account');
  }),
  get(/^\/healthz$/, (ctx) => {
    ctx.auth.db.prepare('SELECT 1').get();
    ctx.res.setHeader('Content-Type', 'text/plain');
    ctx.res.end('ok\n');
  }),
  get(/^\/robots\.txt$/, (ctx) => {
    ctx.res.setHeader('Content-Type', 'text/plain');
    ctx.res.end('User-agent: *\nDisallow: /\n');
  }),
  get(/^\/favicon\.ico$/, () => {
    throw new Redirect('/static/favicon.svg');
  }),

  // An application sends people here to sign in. A signed-in device signs them in at once;
  // anyone else sees the sign-in page.
  get(/^\/interaction\/([\w-]+)$/, async (ctx) => {
    const details = await interaction(ctx);
    const { auth } = ctx;
    if (details.prompt.name === 'login') {
      const signedIn = currentDevice(auth, ctx.req);
      if (signedIn) {
        if (details.session?.accountId && details.session.accountId !== signedIn.person.id) {
          await endBrowserSession(auth, ctx.req, ctx.res);
          throw new Redirect(restart(details));
        }
        return finish(ctx, { login: { accountId: signedIn.person.id } });
      }
      const client = await auth.provider.Client.find(String(details.params.client_id));
      return show(ctx, signInPage(client?.clientName ?? auth.config.rpName, details.uid));
    }
    if (details.prompt.name === 'consent') {
      // Apps that run on someone's computer always pass through here; they belong to the site
      // too, so they get what they asked for.
      const { provider } = auth;
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({
            accountId: details.session!.accountId,
            clientId: String(details.params.client_id),
          });
      if (!grant) throw new HttpError(410, 'This sign-in has expired.');
      const missing = details.prompt.details as {
        missingOIDCScope?: string[];
        missingOIDCClaims?: string[];
      };
      if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(' '));
      if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims);
      const grantId = await grant.save();
      return ctx.auth.provider.interactionFinished(
        ctx.req,
        ctx.res,
        { consent: { grantId } },
        { mergeWithLastSubmission: true },
      );
    }
    throw new HttpError(400, `This service can't answer “${details.prompt.name}”.`);
  }),
  postJson(/^\/interaction\/([\w-]+)\/passkey\/options$/, async (ctx) => {
    await interaction(ctx);
    sendJson(ctx.res, 200, await startAuthentication(ctx.auth));
  }),
  postJson(/^\/interaction\/([\w-]+)\/passkey\/verify$/, async (ctx) => {
    const details = await interaction(ctx);
    const body = await readJson(ctx.req);
    const person = await finishAuthentication(ctx.auth, body.ceremony, body.response);
    const switching = details.session?.accountId && details.session.accountId !== person.id;
    // The result is saved before the browser's session can change, which it does on a switch.
    const next = switching
      ? restart(details)
      : await ctx.auth.provider.interactionResult(
          ctx.req,
          ctx.res,
          { login: { accountId: person.id } },
          { mergeWithLastSubmission: false },
        );
    const device = await signIn(ctx.auth, ctx.req, ctx.res, person, 'passkey');
    logEvent(ctx.auth.db, 'passkey', { personId: person.id, req: ctx.req, device: device.label });
    sendJson(ctx.res, 200, { redirect: next });
  }),
  post(/^\/interaction\/([\w-]+)\/abort$/, async (ctx) => {
    await interaction(ctx);
    await finish(ctx, { error: 'access_denied', error_description: 'Sign-in was cancelled' });
  }),

  get(/^\/login$/, (ctx) => {
    const next = localPath(ctx.url.searchParams.get('next'));
    show(ctx, loginPage(next));
  }),
  postJson(/^\/login\/options$/, async (ctx) => {
    sendJson(ctx.res, 200, await startAuthentication(ctx.auth));
  }),
  postJson(/^\/login\/verify$/, async (ctx) => {
    const body = await readJson(ctx.req);
    const person = await finishAuthentication(ctx.auth, body.ceremony, body.response);
    const device = await signIn(ctx.auth, ctx.req, ctx.res, person, 'passkey');
    logEvent(ctx.auth.db, 'passkey', { personId: person.id, req: ctx.req, device: device.label });
    sendJson(ctx.res, 200, { redirect: localPath(body.next) });
  }),
  post(/^\/logout$/, async (ctx) => {
    const signedIn = currentDevice(ctx.auth, ctx.req);
    await signOut(ctx.auth, ctx.req, ctx.res);
    if (signedIn) {
      logEvent(ctx.auth.db, 'sign-out', {
        personId: signedIn.person.id,
        req: ctx.req,
        device: signedIn.device.label,
      });
    }
    show(ctx, signedOutPage(ctx.auth.config));
  }),

  // An invite opens on GET, which messengers fetch to preview a link; only the button uses it.
  get(/^\/invite\/([\w-]+)$/, (ctx) => {
    const { token, person } = linkPerson(ctx, 'invite');
    if (isAdmin(person)) throw new HttpError(403, 'Administrators sign in with a passkey.');
    const here = currentDevice(ctx.auth, ctx.req)?.person.id === person.id;
    show(ctx, invitePage(person, token, here));
  }),
  post(/^\/invite\/([\w-]+)$/, async (ctx) => {
    const { link, person } = linkPerson(ctx, 'invite');
    if (isAdmin(person)) throw new HttpError(403, 'Administrators sign in with a passkey.');
    if (!useLink(ctx.auth.db, link)) {
      throw new HttpError(410, 'This invite link has been used or has expired. Ask for a new one.');
    }
    const device = await signIn(ctx.auth, ctx.req, ctx.res, person, 'invite');
    logEvent(ctx.auth.db, 'invite', { personId: person.id, req: ctx.req, device: device.label });
    throw new Redirect('/welcome');
  }),
  get(/^\/welcome$/, (ctx) => {
    const { person, device } = requireSignedIn(ctx);
    const hasPasskey = passkeysOf(ctx.auth, person.id).length > 0;
    show(ctx, welcomePage(ctx.auth.config, person, device, hasPasskey));
  }),

  get(/^\/setup\/([\w-]+)$/, (ctx) => {
    const { token, link, person } = linkPerson(ctx, 'setup');
    show(ctx, setupPage(person, token, link));
  }),
  postJson(/^\/setup\/([\w-]+)\/options$/, async (ctx) => {
    const { person } = linkPerson(ctx, 'setup');
    sendJson(ctx.res, 200, await startRegistration(ctx.auth, person));
  }),
  postJson(/^\/setup\/([\w-]+)\/verify$/, async (ctx) => {
    const { link, person } = linkPerson(ctx, 'setup');
    const body = await readJson(ctx.req);
    const passkey = await finishRegistration(
      ctx.auth,
      ctx.req,
      person,
      body.ceremony,
      body.response,
    );
    if (!useLink(ctx.auth.db, link)) {
      deletePasskey(ctx.auth, passkey.id, person.id);
      throw new HttpError(410, 'This link has been used or has expired. Ask for a new one.');
    }
    const device = await signIn(ctx.auth, ctx.req, ctx.res, person, 'setup');
    logEvent(ctx.auth.db, 'setup', { personId: person.id, req: ctx.req, device: device.label });
    sendJson(ctx.res, 200, { redirect: isAdmin(person) ? '/admin' : '/account' });
  }),

  get(/^\/account$/, (ctx) => {
    const signedIn = requireSignedIn(ctx);
    const { person } = signedIn;
    show(
      ctx,
      accountPage(signedIn, passkeysOf(ctx.auth, person.id), devicesOf(ctx.auth, person.id)),
    );
  }),
  postJson(/^\/account\/passkeys\/options$/, async (ctx) => {
    const { person } = requireSignedIn(ctx);
    sendJson(ctx.res, 200, await startRegistration(ctx.auth, person));
  }),
  postJson(/^\/account\/passkeys\/verify$/, async (ctx) => {
    const { person, device } = requireSignedIn(ctx);
    const body = await readJson(ctx.req);
    await finishRegistration(ctx.auth, ctx.req, person, body.ceremony, body.response);
    logEvent(ctx.auth.db, 'passkey-added', {
      personId: person.id,
      req: ctx.req,
      device: device.label,
    });
    sendJson(ctx.res, 200, { redirect: localPath(body.next) });
  }),
  post(/^\/account\/passkeys\/([\w-]+)\/delete$/, (ctx) => {
    const { person, device } = requireSignedIn(ctx);
    deletePasskey(ctx.auth, ctx.params[0]!, person.id);
    logEvent(ctx.auth.db, 'passkey-removed', {
      personId: person.id,
      req: ctx.req,
      device: device.label,
    });
    throw new Redirect('/account');
  }),
  post(/^\/account\/devices\/([\w-]+)\/delete$/, async (ctx) => {
    const { person, device: here } = requireSignedIn(ctx);
    const device = findDevice(ctx.auth, ctx.params[0]!);
    if (device?.personId === person.id && device.id !== here.id) {
      await removeDevice(ctx.auth, device.id);
      logEvent(ctx.auth.db, 'device-removed', {
        personId: person.id,
        req: ctx.req,
        device: here.label,
        detail: device.label,
      });
    }
    throw new Redirect('/account');
  }),
];

/** The service: its own pages first, then oidc-provider for everything OpenID Connect. */
export function createApp(auth: Auth) {
  const files = staticFiles();
  const routes = [...publicRoutes, ...adminRoutes];
  const provide = auth.provider.callback();

  // Which device a session began on, and a line in the activity list for each sign-in to an app.
  auth.provider.on('authorization.success', (ctx) => {
    const session = ctx.oidc.session;
    const signedIn = currentDevice(auth, ctx.req);
    if (session?.accountId && signedIn?.person.id === session.accountId) {
      recordSessionDevice(auth, session.uid, signedIn.device.id);
    }
    logEvent(auth.db, 'app', {
      personId: session?.accountId ?? null,
      detail: ctx.oidc.client?.clientId ?? null,
      req: ctx.req,
      device: signedIn?.device.label ?? null,
    });
  });
  // Signing out of an app, and choosing to sign out of the site too, makes the device forget.
  auth.provider.on('end_session.success', (ctx) => {
    if (!ctx.oidc.params?.logout) return;
    const signedIn = currentDevice(auth, ctx.req);
    if (!signedIn) return;
    auth.db.prepare('DELETE FROM devices WHERE id = ?').run(signedIn.device.id);
    ctx.res.appendHeader(
      'Set-Cookie',
      `${auth.config.secure ? '__Host-device' : 'device'}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${auth.config.secure ? '; Secure' : ''}`,
    );
    logEvent(auth.db, 'sign-out', {
      personId: signedIn.person.id,
      req: ctx.req,
      device: signedIn.device.label,
      detail: ctx.oidc.client?.clientId ?? null,
    });
  });
  auth.provider.on('server_error', (_ctx, error) => console.error('provider error:', error));
  auth.provider.on('backchannel.error', (_ctx, error, client) =>
    console.error(`back-channel logout to ${client.clientId} failed: ${error.message}`),
  );

  return async function handle(req: Req, res: Res) {
    const url = new URL(req.url ?? '/', auth.config.issuer);

    const file = url.pathname.startsWith('/static/') && files.get(url.pathname.slice(8));
    if (file && (req.method === 'GET' || req.method === 'HEAD')) {
      res.setHeader('Content-Type', file.type);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', file.etag);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.headers['if-none-match'] === file.etag) {
        res.statusCode = 304;
        res.end();
      } else {
        res.end(req.method === 'HEAD' ? undefined : file.body);
      }
      return;
    }

    let route: Route | undefined;
    let params: string[] = [];
    let pathMatched = false;
    for (const candidate of routes) {
      const match = candidate.path.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (
        candidate.method === req.method ||
        (candidate.method === 'GET' && req.method === 'HEAD')
      ) {
        route = candidate;
        params = match.slice(1);
        break;
      }
    }
    if (!route) {
      if (pathMatched) {
        res.statusCode = 405;
        res.end();
        return;
      }
      return provide(req, res);
    }

    const ctx: Ctx = { auth, req, res, url, params };
    try {
      pageHeaders(res, appOrigins(auth.db));
      if (req.method === 'POST' && !fromOwnPage(req, auth.config.issuer)) {
        throw new HttpError(403, 'This request came from another site.');
      }
      await route.handle(ctx);
    } catch (error) {
      if (res.headersSent) {
        console.error(error);
        res.destroy();
        return;
      }
      if (error instanceof Redirect) {
        if (route.json) sendJson(res, 401, { error: 'Please sign in again.' });
        else redirect(res, error.location);
        return;
      }
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError ? error.message : 'Something went wrong here. Please try again.';
      if (status >= 500) console.error(error);
      if (route.json) sendJson(res, status, { error: message });
      else sendHtml(res, status, layout(auth.config, messagePage(auth.config, 'Sorry', message)));
    }
  };
}
