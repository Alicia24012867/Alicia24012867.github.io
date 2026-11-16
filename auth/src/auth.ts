import type { DatabaseSync } from 'node:sqlite';
import type Provider from 'oidc-provider';
import type { Config } from './config.ts';

/** What every part of the service works with. */
export type Auth = {
  config: Config;
  db: DatabaseSync;
  provider: Provider;
};
