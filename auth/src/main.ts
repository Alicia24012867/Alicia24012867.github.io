import http from 'node:http';
import { createApp } from './app.ts';
import { configFromEnv, type Config } from './config.ts';
import { openDatabase, sweep } from './db.ts';
import { loadKeys } from './keys.ts';
import { createProvider, type ProviderHooks } from './provider.ts';

/** Starts the service on `config.port`; port 0 picks a free one, as the tests do. */
export async function start(config: Config, hooks: ProviderHooks = {}) {
  // The database and keys are the server's alone.
  process.umask(0o077);
  const db = openDatabase(config.dataDir);
  const provider = createProvider(config, db, loadKeys(config.dataDir), hooks);
  const auth = { config, db, provider };
  const server = http.createServer(createApp(auth));
  // Caddy keeps connections open between requests; the service waits a little longer than it.
  server.keepAliveTimeout = 65_000;
  sweep(db);
  const sweeper = setInterval(() => sweep(db), 3600_000);
  sweeper.unref();
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  const close = async () => {
    clearInterval(sweeper);
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
    db.close();
  };
  return { auth, server, close };
}

if (import.meta.main) {
  const config = configFromEnv();
  const { close } = await start(config);
  console.log(`auth: ${config.issuer}, listening on ${config.port}`);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      close().then(() => process.exit(0));
    });
  }
}
