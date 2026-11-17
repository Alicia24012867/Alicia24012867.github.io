/**
 * A browser without a screen for the contract tests: it keeps each site's cookies as a browser
 * would (by origin, name and path, dropping expired ones), sends an Origin with every change as a
 * page would, and never follows redirects by itself, so each step can be checked.
 */
export class Browser {
  /** @param {string} name tells this browser's requests apart in the backend's own logs */
  constructor(name) {
    this.userAgent = `nymphilia-api-check (${name})`;
    /** @type {{ origin: string, name: string, value: string, path: string, strict: boolean }[]} */
    this.cookies = [];
  }

  /** Keeps a cookie for `url`'s origin, from a Set-Cookie line. */
  setCookie(url, line) {
    const target = new URL(url);
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const at = pair.indexOf('=');
    if (at < 1) return;
    const name = pair.slice(0, at);
    const value = pair.slice(at + 1);
    // Without a Path, a cookie belongs to the folder of the address that set it.
    let path = target.pathname.slice(0, Math.max(1, target.pathname.lastIndexOf('/')));
    let gone = false;
    let strict = false;
    for (const attribute of attributes) {
      const [key = '', setting = ''] = attribute.split('=');
      const lower = key.trim().toLowerCase();
      if (lower === 'path' && setting.startsWith('/')) path = setting;
      if (lower === 'max-age' && Number(setting) <= 0) gone = true;
      if (lower === 'expires' && Date.parse(setting) <= Date.now()) gone = true;
      if (lower === 'samesite' && setting.trim().toLowerCase() === 'strict') strict = true;
    }
    this.cookies = this.cookies.filter(
      (cookie) =>
        !(cookie.origin === target.origin && cookie.name === name && cookie.path === path),
    );
    if (!gone) this.cookies.push({ origin: target.origin, name, value, path, strict });
  }

  /** The cookies sent to `url`; a request from another site leaves out SameSite=Strict ones. */
  cookieHeader(url, crossSite = false) {
    return this.cookies
      .filter(
        (cookie) =>
          cookie.origin === url.origin &&
          (url.pathname === cookie.path ||
            url.pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : `${cookie.path}/`)) &&
          !(crossSite && cookie.strict),
      )
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  /**
   * One request. `json`, `form` or `multipart` (a FormData) is the body. A change carries
   * `origin`, the target's own unless given; null sends none. `crossSite` is an arrival from
   * another site, such as the redirect back from the sign-in service.
   */
  async request(target, { method, json, form, multipart, origin, crossSite, headers } = {}) {
    const url = new URL(target);
    const sent = new Headers({ 'user-agent': this.userAgent, ...headers });
    const cookies = this.cookieHeader(url, crossSite);
    if (cookies) sent.set('cookie', cookies);
    let body;
    if (json !== undefined) {
      body = JSON.stringify(json);
      sent.set('content-type', 'application/json');
    } else if (form) {
      body = new URLSearchParams(form).toString();
      sent.set('content-type', 'application/x-www-form-urlencoded');
    } else if (multipart) body = multipart;
    const verb = method ?? (body === undefined ? 'GET' : 'POST');
    if (!['GET', 'HEAD'].includes(verb) && origin !== null)
      sent.set('origin', origin ?? url.origin);
    const response = await fetch(url, { method: verb, headers: sent, body, redirect: 'manual' });
    for (const line of response.headers.getSetCookie()) this.setCookie(url, line);
    return new Answer(verb, url, response, Buffer.from(await response.arrayBuffer()));
  }
}

/** A response, read whole. */
export class Answer {
  constructor(method, url, response, bytes) {
    this.method = method;
    this.url = url;
    this.status = response.status;
    this.headers = response.headers;
    this.bytes = bytes;
    this.type = response.headers.get('content-type') ?? '';
  }
  get text() {
    return this.bytes.toString('utf8');
  }
  get json() {
    try {
      return JSON.parse(this.text);
    } catch {
      return undefined;
    }
  }
  /** Where a redirect goes, as an absolute address. */
  get location() {
    const location = this.headers.get('location');
    return location === null ? undefined : new URL(location, this.url);
  }
  /** A line on what came back, for a message about it. */
  get summary() {
    const json = this.json;
    const said =
      json && typeof json.error === 'string'
        ? `${json.error}: ${json.message ?? ''}`
        : this.text.replace(/\s+/g, ' ').slice(0, 160);
    return `${this.method} ${this.url.pathname}${this.url.search} → ${this.status}${said ? ` (${said})` : ''}`;
  }
}
