import type { IncomingMessage, ServerResponse } from 'node:http';

export type Req = IncomingMessage;
export type Res = ServerResponse;

/** A failure with the status to answer it by and a message a person can read. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function readCookies(req: Req) {
  const jar = new Map<string, string>();
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!jar.has(name)) jar.set(name, part.slice(at + 1).trim());
  }
  return jar;
}

export type CookieOptions = { maxAge: number; secure: boolean; path?: string };

export function setCookie(res: Res, name: string, value: string, options: CookieOptions) {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${options.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure) parts.push('Secure');
  res.appendHeader('Set-Cookie', parts.join('; '));
}

export function clearCookie(res: Res, name: string, options: Omit<CookieOptions, 'maxAge'>) {
  setCookie(res, name, '', { ...options, maxAge: 0 });
}

const bodyLimit = 64 * 1024;

export async function readBody(req: Req): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > bodyLimit) throw new HttpError(413, 'That was more than this page sends.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readForm(req: Req) {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/x-www-form-urlencoded')) {
    throw new HttpError(415, 'Expected a form.');
  }
  return new URLSearchParams((await readBody(req)).toString('utf8'));
}

export async function readJson(req: Req): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
  try {
    const value: unknown = JSON.parse((await readBody(req)).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    /* Answered below. */
  }
  throw new HttpError(400, 'That was not the JSON this page sends.');
}

/**
 * Whether a request that changes something came from this service's own pages. Browsers name the
 * page's origin on every POST; another site's form or script can't pass for this one.
 */
export function fromOwnPage(req: Req, origin: string) {
  const sent = req.headers.origin;
  if (sent) return sent === origin;
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  try {
    return new URL(req.headers.referer ?? '').origin === origin;
  } catch {
    return false;
  }
}

/** Headers for every page this service writes itself. */
export function pageHeaders(res: Res, formTargets: string) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      'font-src https://nymphilia.com',
      "connect-src 'self'",
      // A form here may end in a redirect to an application, which browsers check against this.
      `form-action 'self' ${formTargets}`.trimEnd(),
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
  );
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
}

export function sendHtml(res: Res, status: number, body: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

export function sendJson(res: Res, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

export function redirect(res: Res, location: string) {
  res.statusCode = 303;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
