import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Headless Chrome, driven over the DevTools protocol, with a virtual authenticator standing in
 * for Touch ID or a phone, so passkeys can be made and used in tests.
 */
export const chromePath = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].find((candidate) => candidate && existsSync(candidate));

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export class Chrome {
  #socket: WebSocket;
  #child: ChildProcess;
  #profile: string;
  #id = 0;
  #pending = new Map<number, Pending>();

  private constructor(child: ChildProcess, socket: WebSocket, profile: string) {
    this.#child = child;
    this.#socket = socket;
    this.#profile = profile;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const pending = message.id && this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error)
        pending.reject(new Error(`${message.error.message} ${message.error.data ?? ''}`));
      else pending.resolve(message.result);
    });
  }

  static async launch() {
    if (!chromePath) throw new Error('Google Chrome is needed; set CHROME_PATH to it');
    const profile = mkdtempSync(path.join(os.tmpdir(), 'auth-chrome-'));
    const child = spawn(
      chromePath,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        // CI runners on Ubuntu don't let Chrome build its sandbox.
        ...(process.env.CI ? ['--no-sandbox'] : []),
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const url = await new Promise<string>((resolve, reject) => {
      let output = '';
      child.stderr!.on('data', (chunk) => {
        output += chunk;
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
        if (match) resolve(match[1]!);
      });
      child.on('exit', () => reject(new Error(`Chrome quit:\n${output}`)));
    });
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new Chrome(child, socket, profile);
  }

  send<T = any>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = ++this.#id;
    this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  /** A new tab, with its own virtual authenticator. */
  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId);
    await page.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await page.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    page.authenticatorId = authenticatorId;
    return page;
  }

  async close() {
    this.#socket.close();
    const exited = new Promise((resolve) => this.#child.once('exit', resolve));
    this.#child.kill();
    await exited;
    rmSync(this.#profile, { recursive: true, force: true });
  }
}

export class Page {
  authenticatorId = '';
  #chrome: Chrome;
  #sessionId: string;

  constructor(chrome: Chrome, sessionId: string) {
    this.#chrome = chrome;
    this.#sessionId = sessionId;
  }

  send<T = any>(method: string, params: object = {}) {
    return this.#chrome.send<T>(method, params, this.#sessionId);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value as T;
  }

  /** Waits until `expression` is true in the page, across the navigations on the way. */
  async waitFor(expression: string, ms = 10_000) {
    const until = Date.now() + ms;
    let last: unknown;
    for (;;) {
      try {
        if (await this.evaluate(`document.readyState === 'complete' && (${expression})`)) return;
      } catch (error) {
        last = error; // The page was between documents.
      }
      if (Date.now() > until) {
        const where = await this.evaluate('location.href').catch(() => '?');
        const text = await this.evaluate('document.body?.innerText').catch(() => '');
        throw new Error(`timed out waiting for ${expression} at ${where}: ${text} ${last ?? ''}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async goto(url: string) {
    // Only the tab in front may use passkeys, as in a browser with windows.
    await this.send('Page.bringToFront');
    await this.send('Page.navigate', { url });
    await this.waitFor(`location.href !== 'about:blank'`);
  }

  async click(selector: string) {
    await this.send('Page.bringToFront');
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }

  path() {
    return this.evaluate<string>('location.pathname');
  }

  text() {
    return this.evaluate<string>('document.body.innerText');
  }

  async credentials() {
    const { credentials } = await this.send('WebAuthn.getCredentials', {
      authenticatorId: this.authenticatorId,
    });
    return credentials as {
      credentialId: string;
      isResidentCredential: boolean;
      userHandle: string;
    }[];
  }

  forgetCookies(name?: string, url?: string) {
    return name
      ? this.send('Network.deleteCookies', { name, url })
      : this.send('Network.clearBrowserCookies');
  }
}
