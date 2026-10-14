// Page memory in headless Chrome, read from Chrome's own memory dumps.
// Start a production preview first, then measure it:
//   npm run build && npm run preview
//   node scripts/benchmark-memory.mjs [http://127.0.0.1:4173] [--runs 5] [--pages /,/blog/]
// Each sample opens a fresh browser, scrolls through the page, collects garbage and
// dumps the page's renderer. Comments are blocked, widget included: giscus runs in
// its own process with third-party data, and the page stays the only renderer drawing.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args.splice(index, 2)[1];
};
const runs = Number(option('--runs', 5));
const pages = option('--pages', '/,/blog/,/notes/,/blog/moments/').split(',');
const chromePath =
  option('--chrome', process.env.CHROME_PATH) ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');
const base = args[0] || 'http://127.0.0.1:4173';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'alicia-memory-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--mute-audio',
      '--window-size=1280,900',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  // Chrome prints its DevTools endpoint on stderr once it is ready.
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    chrome.once('error', reject);
    chrome.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const next = (method, timeout = 30000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error('Timed out waiting for ' + method));
      }, timeout);
      const listener = (message) => {
        if (message.method !== method) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(message.params);
      };
      listeners.add(listener);
    });
  const close = () => {
    socket.close();
    chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { send, next, listeners, close };
}

const scroll = `(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
    scrollTo(0, y);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  scrollTo(0, 0);
  await new Promise((resolve) => setTimeout(resolve, 1500));
})()`;
const pageFacts = `JSON.stringify({
  nodes: document.getElementsByTagName('*').length,
  fontFaces: document.fonts.size,
  fontCssBytes: performance
    .getEntriesByType('resource')
    .filter((entry) => entry.name.startsWith('https://fonts.googleapis.com/'))
    .reduce((sum, entry) => sum + entry.decodedBodySize, 0),
})`;

async function sample(pathname) {
  const browser = await openBrowser();
  try {
    const { send, next, listeners } = browser;
    const { targetInfos } = await send('Target.getTargets');
    const target = targetInfos.find((info) => info.type === 'page');
    const { sessionId } = await send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const page = (method, params) => send(method, params, sessionId);
    await page('Page.enable');
    await page('Network.enable');
    await page('Network.setBlockedURLs', { urls: ['*giscus*'] });
    const loaded = next('Page.loadEventFired');
    await page('Page.navigate', { url: new URL(pathname, base).href });
    await loaded;
    await page('Runtime.evaluate', {
      expression: 'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 8000))])',
      awaitPromise: true,
    });
    await page('Runtime.evaluate', { expression: scroll, awaitPromise: true });
    await page('HeapProfiler.collectGarbage');
    await sleep(500);
    const heap = await page('Runtime.getHeapUsage');
    const facts = JSON.parse(
      (await page('Runtime.evaluate', { expression: pageFacts })).result.value,
    );

    const events = [];
    const collect = (message) => {
      if (message.method === 'Tracing.dataCollected') events.push(...message.params.value);
    };
    listeners.add(collect);
    await send('Tracing.start', {
      traceConfig: {
        includedCategories: ['disabled-by-default-memory-infra'],
        excludedCategories: ['*'],
        memoryDumpConfig: { triggers: [] },
      },
      transferMode: 'ReportEvents',
    });
    await send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
    const complete = next('Tracing.tracingComplete');
    await send('Tracing.end');
    await complete;
    listeners.delete(collect);

    const names = new Map();
    const processes = new Map();
    for (const event of events) {
      if (event.ph === 'M' && event.name === 'process_name') names.set(event.pid, event.args.name);
      if (event.ph !== 'v' || !event.args?.dumps) continue;
      const entry = processes.get(event.pid) ?? { footprint: 0, allocators: {} };
      const { process_totals: totals, allocators = {} } = event.args.dumps;
      if (totals?.private_footprint_bytes)
        entry.footprint = parseInt(totals.private_footprint_bytes, 16);
      for (const [name, node] of Object.entries(allocators))
        if (!name.includes('/') && node.attrs?.size)
          entry.allocators[name] = parseInt(node.attrs.size.value, 16);
      processes.set(event.pid, entry);
    }
    // The page's renderer is the one holding compositor (cc) memory for its frames.
    const [renderer] = [...processes]
      .filter(([pid]) => names.get(pid) === 'Renderer')
      .map(([, entry]) => entry)
      .sort((a, b) => (b.allocators.cc ?? 0) - (a.allocators.cc ?? 0));
    if (!renderer?.allocators.cc) throw new Error('No page renderer in the memory dump');
    return {
      footprintMb: renderer.footprint / 1e6,
      oilpanMb: (renderer.allocators.blink_gc ?? 0) / 1e6,
      v8UsedMb: heap.usedSize / 1e6,
      memoryCacheMb: (renderer.allocators.web_cache ?? 0) / 1e6,
      ...facts,
    };
  } finally {
    browser.close();
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value) => Math.round(value * 100) / 100;
const results = {};
for (const pathname of pages) {
  const samples = [];
  for (let run = 0; run < runs; run++) {
    // A sample whose web fonts failed to load measures a different page; retry it.
    let result;
    for (let attempt = 0; attempt < 3 && !result?.fontFaces; attempt++)
      result = await sample(pathname);
    if (!result.fontFaces) throw new Error('Web fonts did not load for ' + pathname);
    samples.push(result);
  }
  results[pathname] = Object.fromEntries(
    Object.keys(samples[0]).map((key) => {
      const values = samples.map((item) => item[key]);
      return [
        key,
        {
          median: round(median(values)),
          min: round(Math.min(...values)),
          max: round(Math.max(...values)),
        },
      ];
    }),
  );
}
console.log(JSON.stringify({ base, runs, results }, null, 2));
