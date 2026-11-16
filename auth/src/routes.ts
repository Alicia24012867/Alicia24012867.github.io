import type { Auth } from './auth.ts';
import { now } from './db.ts';
import { currentDevice, type SignedIn } from './devices.ts';
import { layout, type Page } from './html.ts';
import { HttpError, sendHtml, type Req, type Res } from './http.ts';
import { isAdmin } from './people.ts';

/** One request to one of the service's own pages. */
export type Ctx = { auth: Auth; req: Req; res: Res; url: URL; params: string[] };

export type Route = {
  method: 'GET' | 'POST';
  path: RegExp;
  /** Answers with JSON, for the passkey script, rather than with a page. */
  json?: boolean;
  handle: (ctx: Ctx) => Promise<void> | void;
};

export const get = (path: RegExp, handle: Route['handle']): Route => ({
  method: 'GET',
  path,
  handle,
});
export const post = (path: RegExp, handle: Route['handle']): Route => ({
  method: 'POST',
  path,
  handle,
});
export const postJson = (path: RegExp, handle: Route['handle']): Route => ({
  method: 'POST',
  path,
  json: true,
  handle,
});

/** Sends people elsewhere, from wherever a request is in its handling. */
export class Redirect extends Error {
  location: string;
  constructor(location: string) {
    super(location);
    this.location = location;
  }
}

export function show(ctx: Ctx, page: Page, status = 200) {
  sendHtml(ctx.res, status, layout(ctx.auth.config, page));
}

/** Only paths on this site may follow a sign-in; anything else goes to the account page. */
export function localPath(value: unknown, fallback = '/account') {
  // Browsers drop tabs and line breaks from addresses, so "/<tab>/evil.example" would become
  // "//evil.example", another site: no control characters at all, and no second slash.
  return typeof value === 'string' && /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(value)
    ? value
    : fallback;
}

const loginFor = (ctx: Ctx) => `/login?next=${encodeURIComponent(ctx.url.pathname)}`;

/** Who's signed in on this browser; anyone else is sent to sign in. */
export function requireSignedIn(ctx: Ctx): SignedIn {
  const signedIn = currentDevice(ctx.auth, ctx.req);
  if (!signedIn) throw new Redirect(loginFor(ctx));
  return signedIn;
}

/** An administrator who used a passkey on this browser in the last 12 hours. */
export const passkeyFreshness = 12 * 3600;

export function requireAdmin(ctx: Ctx): SignedIn {
  const signedIn = requireSignedIn(ctx);
  if (!isAdmin(signedIn.person)) throw new HttpError(403, 'These pages are for administrators.');
  const { passkeyAt } = signedIn.device;
  if (passkeyAt === null || now() - passkeyAt > passkeyFreshness) throw new Redirect(loginFor(ctx));
  return signedIn;
}
